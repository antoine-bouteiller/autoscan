import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { container, TOKENS } from '#core/container'
import type { IPlexClient } from '#integrations/plex.service'
import type { ITelegramClient } from '#integrations/telegram.service'
import { getCompleteMediaDetails } from '#services/metadata.service'
import type { ConversationState } from '#types/telegram'
import { isError, logError } from '#utils/error'
import type { TelegramMessageIn } from '#validators/telegram.validator'

const FORCED_LINE_RATIO_THRESHOLD = 0.1
const SYNC_THRESHOLD_MS = 300

const findLangSrt = (mediaFilePath: string, lang: string): string | undefined => {
  const dir = dirname(mediaFilePath)
  const mediaBase = basename(mediaFilePath, mediaFilePath.slice(mediaFilePath.lastIndexOf('.')))
  const srtPath = join(dir, `${mediaBase}.${lang}.srt`)

  return existsSync(srtPath) ? srtPath : undefined
}

const countLines = (srtFilePath: string): number => {
  const content = readFileSync(srtFilePath, 'utf8')
  return content.trim().split(/\n\n+/).length
}

const parseTimestampMs = (timestamp: string): number => {
  const [h, m, rest] = timestamp.split(':')
  const [s, ms] = rest.split(',')
  return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(ms)
}

const parseStartTimestamps = (srtFilePath: string): number[] => {
  const content = readFileSync(srtFilePath, 'utf8')
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

  for (let i = 0; i < len; i++) {
    if (Math.abs(timestampsA[i] - timestampsB[i]) > SYNC_THRESHOLD_MS) {
      outOfSync++
    }
  }

  return outOfSync / len > 0.5
}

export const subtitleScanCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  await client.sendMessage(message.chat.id, 'Starting subtitle scan...')

  void (async () => {
    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
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

    if (missingSubtitles.length === 0 && outOfSyncSubtitles.length === 0) {
      await client.sendMessage(message.chat.id, 'All media have matching subtitles.')
      return
    }

    let batch = ''

    if (missingSubtitles.length > 0) {
      batch += `*${missingSubtitles.length} media without matching subtitles:*\n\n`
      for (const title of missingSubtitles) {
        batch += `• ${title}\n`
      }
    }

    if (outOfSyncSubtitles.length > 0) {
      if (batch) {
        batch += '\n'
      }
      batch += `*${outOfSyncSubtitles.length} media with out-of-sync subtitles:*\n\n`
      for (const title of outOfSyncSubtitles) {
        batch += `• ${title}\n`
      }
    }

    if (batch) {
      await client.sendMessage(message.chat.id, batch, undefined, 'Markdown')
    }
  })()

  return { step: 'idle' }
}
