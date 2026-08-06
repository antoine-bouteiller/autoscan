import { basename, dirname, join } from 'node:path'

import { Effect } from 'effect'

import { BackgroundTasks, Plex } from '@/core/runtime.service'
import { getCompleteMediaDetails } from '@/domains/media/services/metadata.service'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'
import { logError } from '@/shared/utils/error'
import { safeExistsSync, safeReadFileSync } from '@/shared/utils/fs'

const FORCED_LINE_RATIO_THRESHOLD = 0.1
const SYNC_THRESHOLD_MS = 300

export const findLangSrt = (mediaFilePath: string, lang: string): string | undefined => {
  const mediaBase = basename(mediaFilePath, mediaFilePath.slice(mediaFilePath.lastIndexOf('.')))
  const srtPath = join(dirname(mediaFilePath), `${mediaBase}.${lang}.srt`)
  return safeExistsSync(srtPath) ? srtPath : undefined
}

export const countLines = (srtFilePath: string): number => {
  const content = safeReadFileSync(srtFilePath)
  return content instanceof Error ? 0 : content.trim().split(/\n\n+/).length
}

export const parseTimestampMs = (timestamp: string): number => {
  const [hours, minutes, rest] = timestamp.split(':')
  const [seconds, milliseconds] = rest.split(',')
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(milliseconds)
}

export const parseStartTimestamps = (srtFilePath: string): number[] => {
  const content = safeReadFileSync(srtFilePath)
  if (content instanceof Error) {
    return []
  }
  const timestamps: number[] = []
  for (const block of content.trim().split(/\n\n+/)) {
    const match = /(?<start>\d{2}:\d{2}:\d{2},\d{3})\s*-->/.exec(block)
    if (match?.groups !== undefined) {
      timestamps.push(parseTimestampMs(match.groups['start']))
    }
  }
  return timestamps
}

export const areSubtitlesOutOfSync = (srtPathA: string, srtPathB: string): boolean => {
  const timestampsA = parseStartTimestamps(srtPathA)
  const timestampsB = parseStartTimestamps(srtPathB)
  const length = Math.min(timestampsA.length, timestampsB.length)
  if (length === 0) {
    return false
  }
  let outOfSync = 0
  for (let index = 0; index < length; index++) {
    if (Math.abs(timestampsA[index] - timestampsB[index]) > SYNC_THRESHOLD_MS) {
      outOfSync++
    }
  }
  return outOfSync / length > 0.5
}

const analyzeMedia = (plexClient: IPlexClient) =>
  Effect.gen(function* () {
    const sections = yield* plexClient.getSections()
    const missingSubtitles: string[] = []
    const outOfSyncSubtitles: string[] = []

    for (const section of sections) {
      const medias = yield* plexClient.getSectionMedia(section.key, section.type)
      for (const media of medias) {
        const details = yield* getCompleteMediaDetails(Number(media.ratingKey)).pipe(
          Effect.catch((error) => Effect.sync(() => logError(error, 'subtitleScan')).pipe(Effect.as(undefined)))
        )
        if (details === undefined || details.originalLanguage === 'fr') {
          continue
        }

        const enSrt = findLangSrt(details.file, 'en')
        if (enSrt === undefined) {
          missingSubtitles.push(details.mediaTitle)
          continue
        }

        const frSrt = findLangSrt(details.file, 'fr')
        if (frSrt !== undefined) {
          const enLines = countLines(enSrt)
          const frLines = countLines(frSrt)
          if (frLines > 0 && enLines / frLines < FORCED_LINE_RATIO_THRESHOLD) {
            missingSubtitles.push(details.mediaTitle)
          } else if (areSubtitlesOutOfSync(enSrt, frSrt)) {
            outOfSyncSubtitles.push(details.mediaTitle)
          }
        }
      }
    }

    return { missingSubtitles, outOfSyncSubtitles }
  })

export const formatReport = (missingSubtitles: string[], outOfSyncSubtitles: string[]): string => {
  const parts: string[] = []
  if (missingSubtitles.length > 0) {
    parts.push(`*${missingSubtitles.length} media without matching subtitles:*\n\n${missingSubtitles.map((title) => `• ${title}`).join('\n')}`)
  }
  if (outOfSyncSubtitles.length > 0) {
    parts.push(`*${outOfSyncSubtitles.length} media with out-of-sync subtitles:*\n\n${outOfSyncSubtitles.map((title) => `• ${title}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

export const subtitleScanCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  Effect.gen(function* () {
    yield* client.sendMessage(message.chat.id, 'Starting subtitle scan...')
    const plexClient = yield* Plex
    const tasks = yield* BackgroundTasks
    const task = analyzeMedia(plexClient).pipe(
      Effect.flatMap(({ missingSubtitles, outOfSyncSubtitles }) => {
        const report = formatReport(missingSubtitles, outOfSyncSubtitles)
        return report.length > 0
          ? client.sendMessage(message.chat.id, report, { parseMode: 'Markdown' })
          : client.sendMessage(message.chat.id, 'All media have matching subtitles.')
      }),
      Effect.catch((error) => Effect.sync(() => logError(error, 'Subtitle Scan')))
    )
    yield* tasks.start(task)
    return { step: 'idle' } as const
  })
