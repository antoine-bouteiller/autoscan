import { basename, dirname, join } from 'node:path'

import { container, TOKENS } from '#core/container'
import { type IPlexClient } from '#integrations/plex/plex.service'
import { type ITelegramClient } from '#integrations/telegram/telegram.service'
import { type TelegramMessageIn } from '#integrations/telegram/telegram.validator'
import { getCompleteMediaDetails } from '#media/metadata.service'
import { type ConversationState } from '#providers/telegram/types'
import { isError, logError } from '#shared/utils/error'
import { safeExistsSync, safeReadFileSync } from '#shared/utils/fs'

const FORCED_LINE_RATIO_THRESHOLD = 0.1
const SYNC_THRESHOLD_MS = 300

const findLangSrt = (mediaFilePath: string, lang: string): string | undefined => {
  const dir = dirname(mediaFilePath)
  const mediaBase = basename(mediaFilePath, mediaFilePath.slice(mediaFilePath.lastIndexOf('.')))
  const srtPath = join(dir, `${mediaBase}.${lang}.srt`)

  return safeExistsSync(srtPath) ? srtPath : undefined
}

const countLines = (srtFilePath: string): number => {
  const content = safeReadFileSync(srtFilePath)
  if (content instanceof Error) {
    return 0
  }
  return content.trim().split(/\n\n+/).length
}

const parseTimestampMs = (timestamp: string): number => {
  const [hours, minutes, rest] = timestamp.split(':')
  const [seconds, ms] = rest.split(',')
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(ms)
}

const parseStartTimestamps = (srtFilePath: string): number[] => {
  const content = safeReadFileSync(srtFilePath)
  if (content instanceof Error) {
    return []
  }
  const blocks = content.trim().split(/\n\n+/)
  const timestamps: number[] = []

  for (const block of blocks) {
    const match = /(\d{2}:\d{2}:\d{2},\d{3})\s*-->/.exec(block)
    if (match) {
      timestamps.push(parseTimestampMs(match[1]))
    }
  }

  return timestamps
}

const areSubtitlesOutOfSync = (srtPathA: string, srtPathB: string): boolean => {
  const timestampsA = parseStartTimestamps(srtPathA)
  const timestampsB = parseStartTimestamps(srtPathB)
  const len = Math.min(timestampsA.length, timestampsB.length)

  if (len === 0) {
    return false
  }

  let outOfSync = 0

  for (let idx = 0; idx < len; idx++) {
    if (Math.abs(timestampsA[idx] - timestampsB[idx]) > SYNC_THRESHOLD_MS) {
      outOfSync++
    }
  }

  return outOfSync / len > 0.5
}

const analyzeMedia = async (plexClient: IPlexClient) => {
  const sections = await plexClient.getSections()
  const missingSubtitles: string[] = []
  const outOfSyncSubtitles: string[] = []

  for (const section of sections) {
    const medias = await plexClient.getSectionMedia(section.key, section.type)

    for (const media of medias) {
      const details = await getCompleteMediaDetails(Number(media.ratingKey))

      if (isError(details)) {
        logError(details, 'subtitleScan')
        continue
      }

      if (details.originalLanguage === 'fr') {
        continue
      }

      const enSrt = findLangSrt(details.file, 'en')

      if (!enSrt) {
        missingSubtitles.push(details.mediaTitle)
        continue
      }

      const frSrt = findLangSrt(details.file, 'fr')

      if (frSrt) {
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
}

const formatReport = (missingSubtitles: string[], outOfSyncSubtitles: string[]): string => {
  const parts: string[] = []

  if (missingSubtitles.length > 0) {
    parts.push(`*${missingSubtitles.length} media without matching subtitles:*\n\n${missingSubtitles.map((title) => `• ${title}`).join('\n')}`)
  }

  if (outOfSyncSubtitles.length > 0) {
    parts.push(`*${outOfSyncSubtitles.length} media with out-of-sync subtitles:*\n\n${outOfSyncSubtitles.map((title) => `• ${title}`).join('\n')}`)
  }

  return parts.join('\n\n')
}

export const subtitleScanCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  await client.sendMessage(message.chat.id, 'Starting subtitle scan...')

  void (async () => {
    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
    const { missingSubtitles, outOfSyncSubtitles } = await analyzeMedia(plexClient)

    const report = formatReport(missingSubtitles, outOfSyncSubtitles)

    await (report
      ? client.sendMessage(message.chat.id, report, { parseMode: 'Markdown' })
      : client.sendMessage(message.chat.id, 'All media have matching subtitles.'))
  })()

  return { step: 'idle' }
}
