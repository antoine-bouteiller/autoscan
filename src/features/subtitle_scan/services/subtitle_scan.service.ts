import { Cause, DateTime, Effect } from 'effect'

import { Env } from '@/config/env'
import { Bazarr, Ffmpeg, Telegram } from '@/core/runtime.service'
import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { getScan, recordScan, type SubtitleScanRecord, type SubtitleVerdict } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { discoverSubtitleFiles, readSubtitleFile, type SubtitleFileSnapshot } from '@/features/subtitle_scan/services/subtitle_files.service'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem } from '@/integrations/bazarr/bazarr.service'
import { type HttpClientError } from '@/shared/types/http_client'
import { areSubtitlesOutOfSync, isForcedSubtitleContent } from '@/shared/utils/subtitle'

const logFailure = <Success, Error, Requirements>(effect: Effect.Effect<Success, Error, Requirements>, operation: string) =>
  effect.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      (cause) => Effect.logWarning(cause, operation).pipe(Effect.as(undefined))
    )
  )

const divergentCandidates = (candidates: readonly SubtitleFileSnapshot[], references: readonly SubtitleFileSnapshot[]) => {
  const targets = new Map<string, SubtitleFileSnapshot>()
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    if (candidate === undefined) {
      continue
    }
    if (references.some((reference) => areSubtitlesOutOfSync(candidate.content, reference.content))) {
      targets.set(candidate.path, candidate)
    }
    for (let otherIndex = index + 1; otherIndex < candidates.length; otherIndex++) {
      const other = candidates[otherIndex]
      if (other !== undefined && areSubtitlesOutOfSync(candidate.content, other.content)) {
        targets.set(candidate.path, candidate)
        targets.set(other.path, other)
      }
    }
  }
  return targets
}

export const scanMediaSubtitles = <Requirements>(
  details: SubtitleScanMedia,
  getItem: Effect.Effect<BazarrItem | undefined, HttpClientError, Requirements>,
  onScan: Effect.Effect<void> = Effect.void
) =>
  Effect.gen(function* () {
    const files = yield* discoverSubtitleFiles(details.file)
    const nonForced = files.filter((file) => !file.forced)
    const scans = new Map<string, SubtitleScanRecord | undefined>()
    for (const file of nonForced) {
      scans.set(file.path, yield* getScan(file.path, SUBTITLE_SCAN_VERSION))
    }

    const candidates = nonForced.filter((file) => scans.get(file.path) === undefined)
    if (candidates.length === 0) {
      return
    }

    yield* onScan
    const item = yield* getItem
    if (item === undefined) {
      yield* Effect.logWarning(`Bazarr item not found for ${details.file}`)
      return
    }
    const ffmpeg = yield* Ffmpeg
    const { duration } = yield* ffmpeg.ffprobe(details.file)
    const bazarr = yield* Bazarr
    const now = yield* DateTime.nowAsDate
    const references = nonForced.filter((file) => scans.get(file.path)?.verdict === 'passed')
    const candidateSnapshots = yield* Effect.forEach(readSubtitleFile)(candidates)
    const record = (file: SubtitleFileSnapshot, verdict: SubtitleVerdict) =>
      recordScan({ filePath: file.path, scanVersion: SUBTITLE_SCAN_VERSION, scannedAt: now, verdict })
    const subtitleAt = (file: SubtitleFileSnapshot) => item.subtitles.find((subtitle) => subtitle.path === file.path)

    const surviving: SubtitleFileSnapshot[] = []
    for (const file of candidateSnapshots) {
      if (!isForcedSubtitleContent(file.content, duration)) {
        surviving.push(file)
        continue
      }
      const subtitle = subtitleAt(file)
      if (subtitle === undefined) {
        yield* Effect.logWarning(`Bazarr subtitle not found for forced sidecar ${file.path}`)
        continue
      }
      const removed = yield* logFailure(bazarr.deleteSubtitle(item, subtitle).pipe(Effect.as(true)), `Removing forced subtitle ${file.path}`)
      if (removed !== undefined) {
        yield* record(file, 'forced_removed')
      }
    }

    const referenceSnapshots = surviving.length === 0 ? [] : yield* Effect.forEach(readSubtitleFile)(references)
    const targets = divergentCandidates(surviving, referenceSnapshots)

    for (const file of targets.values()) {
      const subtitle = subtitleAt(file)
      if (subtitle === undefined) {
        yield* Effect.logWarning(`Bazarr subtitle not found for sync sidecar ${file.path}`)
        continue
      }
      const synced = yield* logFailure(bazarr.syncSubtitle(item, subtitle).pipe(Effect.as(true)), `Synchronizing subtitle ${file.path}`)
      if (synced !== undefined) {
        yield* record(file, 'sync_requested')
        const telegram = yield* Telegram
        const env = yield* Env
        yield* logFailure(
          telegram.sendMessage(env.TELEGRAM_CHAT_ID, `Subtitle resync requested for ${details.mediaTitle} (${file.language})`),
          `Notifying subtitle resync for ${file.path}`
        )
      }
    }
    for (const file of surviving) {
      if (!targets.has(file.path)) {
        yield* record(file, 'passed')
      }
    }
  })
