/* oxlint-disable unicorn/no-null, autoscan/no-shape-in-symbol-names -- registry evidence and assessment field names follow their contracts. */
import { Cause, DateTime, Effect } from 'effect'

import { Env } from '@/config/env'
import { Bazarr, Ffmpeg, Telegram } from '@/core/runtime.service'
import {
  REFERENCE_LANGUAGE,
  SPEECH_MEDIA_PER_PASS,
  SPEECH_WINDOW_SECONDS,
  SPEECH_WINDOWS,
  SUBTITLE_SCAN_VERSION,
} from '@/features/subtitle_scan/constants'
import { getScan, recordScan, type SubtitleVerdict } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { hasTranscodeScan } from '@/features/subtitle_scan/repositories/transcode_scan.repository'
import { deleteSubtitleButton } from '@/features/subtitle_scan/services/invalid_subtitles.service'
import { isCounting, sameStat, statFile } from '@/features/subtitle_scan/services/scan_registry.service'
import { assessTrack, type TrackShape } from '@/features/subtitle_scan/services/subtitle_alignment'
import {
  discoverSubtitleFiles,
  readSubtitleFile,
  type SubtitleFile,
  type SubtitleFileSnapshot,
} from '@/features/subtitle_scan/services/subtitle_files.service'
import { type Fit, type PairShape, parseCues, passesCoverage, profilePair } from '@/features/subtitle_scan/services/subtitle_profile'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem, type IBazarrClient, type SubtitleSource } from '@/integrations/bazarr/bazarr.service'
import { type IFfmpegClient, type SpeechWindow } from '@/integrations/ffmpeg/ffmpeg.service'
import { type HttpClientError } from '@/shared/types/http_client'
import { isForcedSubtitleContent } from '@/shared/utils/subtitle'

export interface SubtitleScanPass {
  readonly sampled: Set<string>
}

const logFailure = <Success, Error, Requirements>(effect: Effect.Effect<Success, Error, Requirements>, operation: string) =>
  effect.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      (cause) => Effect.logWarning(cause, operation).pipe(Effect.as(undefined))
    )
  )

interface MediaScan {
  readonly details: SubtitleScanMedia
  readonly item: BazarrItem
  readonly bazarr: IBazarrClient
  readonly duration: number
  readonly sources: Effect.Effect<ReadonlyMap<string, SubtitleSource> | undefined, HttpClientError>
}
interface Judgment {
  readonly verdict: 'passed' | 'invalid' | 'inconclusive'
  readonly fit: Fit | null
}

const record = (file: SubtitleFileSnapshot, verdict: SubtitleVerdict) =>
  Effect.gen(function* () {
    const scannedAt = yield* DateTime.nowAsDate
    const evidence = file.language === REFERENCE_LANGUAGE ? 'audio' : 'reference'
    yield* recordScan({
      evidence: verdict === 'passed' ? evidence : null,
      fileMtime: file.stat.mtime,
      filePath: file.path,
      fileSize: file.stat.size,
      scanVersion: SUBTITLE_SCAN_VERSION,
      scannedAt,
      verdict,
    })
  })
const notify = (scan: MediaScan, file: SubtitleFileSnapshot, blacklisted: boolean) =>
  Effect.gen(function* () {
    const telegram = yield* Telegram
    const env = yield* Env
    const text = blacklisted
      ? `Blacklisted invalid subtitle for ${scan.details.mediaTitle} (${file.language}); Bazarr is searching for another.`
      : `Invalid subtitle for ${scan.details.mediaTitle} (${file.language})`
    yield* logFailure(
      telegram.sendMessage(
        env.TELEGRAM_CHAT_ID,
        text,
        blacklisted
          ? undefined
          : {
              replyMarkup: { inline_keyboard: [[deleteSubtitleButton(file.path, '🗑️ Delete')]] },
            }
      ),
      `Notifying invalid subtitle for ${file.path}`
    )
  })
const unchanged = (file: SubtitleFileSnapshot) => statFile(file.path).pipe(Effect.map((stat) => sameStat(file.stat, stat)))

const invalid = (scan: MediaScan, file: SubtitleFileSnapshot, repaired: boolean) =>
  Effect.gen(function* () {
    const source = repaired ? undefined : (yield* scan.sources)?.get(file.path)
    const subtitle = scan.item.subtitles.find((entry) => entry.path === file.path)
    const canBlacklist = source?.kind === 'provider' && subtitle !== undefined
    // A replacement can land during history lookup; never condemn or mutate that new file.
    if (canBlacklist && !(yield* unchanged(file))) {
      return
    }
    yield* record(file, 'invalid')
    const blacklisted = canBlacklist
      ? yield* logFailure(scan.bazarr.blacklistSubtitle(scan.item, subtitle, source).pipe(Effect.as(true)), `Blacklisting subtitle ${file.path}`)
      : false
    yield* notify(scan, file, blacklisted === true)
  })
const repair = (scan: MediaScan, file: SubtitleFileSnapshot, fit: Fit) =>
  Effect.gen(function* () {
    const subtitle = scan.item.subtitles.find((entry) => entry.path === file.path)
    if (subtitle === undefined) {
      return yield* Effect.die(`Bazarr subtitle not found for repair: ${file.path}`)
    }
    if (!(yield* unchanged(file))) {
      return yield* Effect.die(`Subtitle changed before repair: ${file.path}`)
    }
    yield* scan.bazarr.modifySubtitle(scan.item, subtitle, fit)
    return yield* readSubtitleFile(file)
  })
const englishVerdict = (classification: TrackShape): Judgment['verdict'] => {
  if (classification === 'aligned') {
    return 'passed'
  }
  return classification === 'inconclusive' ? 'inconclusive' : 'invalid'
}
const otherVerdict = (classification: PairShape, coverage: boolean): Judgment['verdict'] => {
  if (classification === 'agree') {
    return coverage ? 'passed' : 'invalid'
  }
  return classification === 'undetermined' ? 'inconclusive' : 'invalid'
}
const judgeEnglish = (file: SubtitleFileSnapshot, windows: readonly SpeechWindow[], repaired: boolean) =>
  Effect.gen(function* () {
    const assessment = assessTrack(parseCues(file.content), windows)
    yield* Effect.logInfo(`Speech assessment ${file.path}`, { shape: assessment.shape, windows: assessment.windows })
    if (!repaired && assessment.fit !== null) {
      return { fit: assessment.fit, verdict: 'invalid' } satisfies Judgment
    }
    return { fit: null, verdict: englishVerdict(assessment.shape) } satisfies Judgment
  })
const judgeOther = (reference: SubtitleFileSnapshot, duration: number) => (file: SubtitleFileSnapshot, repaired: boolean) =>
  Effect.gen(function* () {
    const ref = parseCues(reference.content)
    const track = parseCues(file.content)
    const profile = profilePair(ref, track, duration)
    yield* Effect.logInfo(`Reference profile ${file.path}`, { segments: profile.segments, shape: profile.shape })
    if (!repaired && profile.fit !== null) {
      return { fit: profile.fit, verdict: 'invalid' } satisfies Judgment
    }
    return { fit: null, verdict: otherVerdict(profile.shape, passesCoverage(ref, track, duration)) } satisfies Judgment
  })
const judge = (scan: MediaScan, file: SubtitleFileSnapshot, assess: (snapshot: SubtitleFileSnapshot, repaired: boolean) => Effect.Effect<Judgment>) =>
  Effect.gen(function* () {
    const initial = yield* assess(file, false)
    const repaired = initial.fit !== null
    const snapshot = initial.fit === null ? file : yield* repair(scan, file, initial.fit)
    const result = repaired ? yield* assess(snapshot, true) : initial
    yield* result.verdict === 'invalid' ? invalid(scan, snapshot, repaired) : record(snapshot, result.verdict)
    return snapshot
  })
const candidatesOf = (tracks: readonly SubtitleFile[]) =>
  Effect.gen(function* () {
    const candidates: SubtitleFile[] = []
    for (const file of tracks) {
      const eligible = yield* logFailure(
        Effect.gen(function* () {
          const stat = yield* statFile(file.path)
          const row = yield* getScan(file.path, SUBTITLE_SCAN_VERSION)
          return !isCounting(row, stat)
        }),
        `Checking subtitle identity ${file.path}`
      )
      if (eligible === true) {
        candidates.push(file)
      }
    }
    return candidates
  })
const readCandidates = (files: readonly SubtitleFile[]) =>
  Effect.gen(function* () {
    const snapshots: SubtitleFileSnapshot[] = []
    for (const file of files) {
      const snapshot = yield* logFailure(readSubtitleFile(file), `Reading subtitle ${file.path}`)
      if (snapshot !== undefined) {
        snapshots.push(snapshot)
      }
    }
    return snapshots
  })
const removeForced = (scan: MediaScan, snapshots: readonly SubtitleFileSnapshot[]) =>
  Effect.gen(function* () {
    const remaining: SubtitleFileSnapshot[] = []
    for (const file of snapshots) {
      if (!isForcedSubtitleContent(file.content, scan.duration)) {
        remaining.push(file)
        continue
      }
      const subtitle = scan.item.subtitles.find((entry) => entry.path === file.path)
      yield* subtitle === undefined
        ? Effect.logWarning(`Bazarr subtitle not found for forced sidecar ${file.path}`)
        : logFailure(scan.bazarr.deleteSubtitle(scan.item, subtitle), `Removing forced subtitle ${file.path}`)
    }
    return remaining
  })
const sample = (details: SubtitleScanMedia, probe: Effect.Success<ReturnType<IFfmpegClient['ffprobe']>>, pass: SubtitleScanPass) =>
  Effect.gen(function* () {
    if (pass.sampled.has(details.file) || pass.sampled.size >= SPEECH_MEDIA_PER_PASS) {
      return undefined
    }
    if (!(yield* hasTranscodeScan(details.file, details.originalLanguage))) {
      return undefined
    }
    const audio = probe.streams.filter((stream) => stream.codec_type === 'audio')
    const matching = audio.flatMap((stream, index) => (stream.tags?.language === details.originalLanguage ? [index] : []))
    if (matching.length !== 1) {
      yield* Effect.logWarning(
        `Expected exactly one original-language audio stream for ${details.file} (${details.originalLanguage}); found ${matching.length}`
      )
      return undefined
    }
    pass.sampled.add(details.file)
    yield* Effect.logInfo(`Sampling audio stream ${matching[0]} (${details.originalLanguage}) of ${details.file}`)
    const ffmpeg = yield* Ffmpeg
    return yield* ffmpeg.sampleSpeech(
      details.file,
      matching[0],
      SPEECH_WINDOWS.map((fraction) => ({ duration: SPEECH_WINDOW_SECONDS, start: probe.duration * fraction }))
    )
  })

const referenceOf = (tracks: readonly SubtitleFile[], snapshots: ReadonlyMap<string, SubtitleFileSnapshot>) =>
  Effect.gen(function* () {
    for (const file of tracks.filter((track) => track.language === REFERENCE_LANGUAGE)) {
      const row = yield* getScan(file.path, SUBTITLE_SCAN_VERSION)
      if (row?.verdict !== 'passed' || row.evidence !== 'audio') {
        continue
      }
      const stat = yield* logFailure(statFile(file.path), `Checking English reference ${file.path}`)
      if (stat === undefined) {
        return undefined
      }
      if (!isCounting(row, stat)) {
        continue
      }
      return yield* logFailure(
        Effect.gen(function* () {
          const snapshot = snapshots.get(file.path) ?? (yield* readSubtitleFile(file))
          return sameStat(stat, snapshot.stat) ? snapshot : undefined
        }),
        `Reading English reference ${file.path}`
      )
    }
    return undefined
  })

export const scanMediaSubtitles = <Requirements>(
  details: SubtitleScanMedia,
  getItem: Effect.Effect<BazarrItem | undefined, HttpClientError, Requirements>,
  pass: SubtitleScanPass
) =>
  Effect.gen(function* () {
    const tracks = (yield* discoverSubtitleFiles(details.file)).filter((file) => !file.forced)
    const candidates = yield* candidatesOf(tracks)
    if (candidates.length === 0) {
      return
    }
    const item = yield* getItem
    if (item === undefined) {
      yield* Effect.logWarning(`Bazarr item not found for ${details.file}`)
      return
    }
    const snapshots = yield* readCandidates(candidates)
    const ffmpeg = yield* Ffmpeg
    const probe = yield* ffmpeg.ffprobe(details.file)
    const { duration } = probe
    const bazarr = yield* Bazarr
    const sources = yield* Effect.cached(
      logFailure(
        Effect.suspend(() => bazarr.getSubtitleSources(item)),
        `Looking up subtitle sources for ${details.file}`
      )
    )
    const scan: MediaScan = { bazarr, details, duration, item, sources }
    const remaining = yield* removeForced(scan, snapshots)
    const english = remaining.filter((file) => file.language === REFERENCE_LANGUAGE)
    const windows = english.length === 0 ? undefined : yield* sample(details, probe, pass)
    const read = new Map(remaining.map((file) => [file.path, file]))
    if (windows !== undefined) {
      for (const file of english) {
        const judged = yield* logFailure(
          judge(scan, file, (snapshot, repaired) => judgeEnglish(snapshot, windows, repaired)),
          `Judging English subtitle ${file.path}`
        )
        if (judged !== undefined) {
          read.set(file.path, judged)
        }
      }
    }
    const others = remaining.filter((track) => track.language !== REFERENCE_LANGUAGE)
    if (others.length === 0) {
      return
    }
    const reference = yield* referenceOf(tracks, read)
    if (reference === undefined) {
      return
    }
    for (const file of others) {
      yield* logFailure(judge(scan, file, judgeOther(reference, duration)), `Judging subtitle ${file.path}`)
    }
  })
