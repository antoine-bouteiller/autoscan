import { Cause, DateTime, Effect } from 'effect'

import { Env } from '@/config/env'
import { Bazarr, Ffmpeg, Telegram } from '@/core/runtime.service'
import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { getScan, recordScan, type SubtitleScanRecord, type SubtitleVerdict } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { discoverSubtitleFiles, readSubtitleFile, type SubtitleFileSnapshot } from '@/features/subtitle_scan/services/subtitle_files.service'
import { assessSubtitleTiming } from '@/features/subtitle_scan/services/subtitle_timing'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem } from '@/integrations/bazarr/bazarr.service'
import { type HttpClientError } from '@/shared/types/http_client'
import { isForcedSubtitleContent } from '@/shared/utils/subtitle'

const logFailure = <Success, Error, Requirements>(effect: Effect.Effect<Success, Error, Requirements>, operation: string) =>
  effect.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterrupts(cause),
      (cause) => Effect.logWarning(cause, operation).pipe(Effect.as(undefined))
    )
  )

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

    const candidates = nonForced.filter((file) => scans.get(file.path) === undefined || scans.get(file.path)?.verdict === 'sync_requested')
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
    const { duration, streams } = yield* ffmpeg.ffprobe(details.file)
    const bazarr = yield* Bazarr
    const now = yield* DateTime.nowAsDate
    const candidateSnapshots = yield* Effect.forEach(readSubtitleFile)(candidates)
    const record = (file: SubtitleFileSnapshot, verdict: SubtitleVerdict) =>
      recordScan({ filePath: file.path, scanVersion: SUBTITLE_SCAN_VERSION, scannedAt: now, verdict })
    const subtitleAt = (file: SubtitleFileSnapshot) => item.subtitles.find((subtitle) => subtitle.path === file.path)
    const alert = (file: SubtitleFileSnapshot, verdict: 'invalid' | 'inconclusive') =>
      Effect.gen(function* () {
        yield* record(file, verdict)
        yield* Effect.logWarning(
          verdict === 'invalid' ? `Subtitle remains invalid after sync: ${file.path}` : `Insufficient speech evidence for subtitle: ${file.path}`
        )
        const telegram = yield* Telegram
        const env = yield* Env
        const message = verdict === 'invalid' ? 'Invalid subtitle' : 'Inconclusive subtitle check'
        yield* logFailure(
          telegram
            .sendMessage(env.TELEGRAM_CHAT_ID, `${message} for ${details.mediaTitle} (${file.language})`)
            .pipe(Effect.tap(() => Effect.logInfo(`Sent ${verdict} subtitle alert for ${file.path}`))),
          `Notifying ${verdict} subtitle for ${file.path}`
        )
      })

    const surviving: SubtitleFileSnapshot[] = []
    for (const file of candidateSnapshots) {
      if (!isForcedSubtitleContent(file.content, duration)) {
        surviving.push(file)
        continue
      }
      if (scans.get(file.path)?.verdict === 'sync_requested') {
        yield* alert(file, 'invalid')
        continue
      }
      const subtitle = subtitleAt(file)
      if (subtitle === undefined) {
        yield* Effect.logWarning(`Bazarr subtitle not found for forced sidecar ${file.path}`)
        continue
      }
      const removed = yield* logFailure(bazarr.deleteSubtitle(item, subtitle).pipe(Effect.as(true)), `Removing forced subtitle ${file.path}`)
      if (removed !== undefined) {
        yield* Effect.logInfo(`Removed forced subtitle ${file.path}`)
        yield* record(file, 'forced_removed')
      }
    }

    if (surviving.length === 0) {
      return
    }
    const audio = streams.filter((stream) => stream.codec_type === 'audio')
    const selected = audio.find((stream) => stream.tags?.language === details.preferredLanguage) ?? audio[0]
    if (selected?.index === undefined) {
      yield* Effect.logWarning(`No audio stream for subtitle validation: ${details.file}`)
      yield* Effect.forEach((file: SubtitleFileSnapshot) => alert(file, 'inconclusive'))(surviving)
      return
    }
    const activity = yield* ffmpeg.speechActivity(details.file, selected.index)
    yield* Effect.forEach((file: SubtitleFileSnapshot) =>
      Effect.gen(function* () {
        const timing = assessSubtitleTiming(file.content, activity)
        yield* Effect.logInfo(`Subtitle speech timing: ${file.path}`, timing)
        if (timing.verdict === 'inconclusive') {
          yield* alert(file, 'inconclusive')
          return
        }
        if (timing.verdict === 'aligned') {
          yield* record(file, 'passed')
          yield* Effect.logInfo(`Subtitle passed: ${file.path}`)
          return
        }
        if (scans.get(file.path)?.verdict === 'sync_requested') {
          yield* alert(file, 'invalid')
          return
        }
        const subtitle = subtitleAt(file)
        if (subtitle === undefined) {
          yield* Effect.logWarning(`Bazarr subtitle not found for sync sidecar ${file.path}`)
          return
        }
        const synced = yield* logFailure(bazarr.syncSubtitle(item, subtitle).pipe(Effect.as(true)), `Synchronizing subtitle ${file.path}`)
        if (synced !== undefined) {
          yield* Effect.logInfo(`Requested subtitle sync for ${file.path}`)
          yield* record(file, 'sync_requested')
        }
      })
    )(surviving)
  })
