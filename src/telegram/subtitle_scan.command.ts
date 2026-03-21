import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { container, TOKENS } from '#core/container'
import type { IPlexClient } from '#integrations/plex.service'
import type { ITelegramClient } from '#integrations/telegram.service'
import { getCompleteMediaDetails } from '#services/metadata.service'
import type { ConversationState } from '#types/telegram'
import { isError, logError } from '#utils/error'
import type { TelegramMessageIn } from '#validators/telegram.validator'

const FORCED_LINE_RATIO_THRESHOLD = 0.3

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

export const subtitleScanCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  await client.sendMessage(message.chat.id, 'Starting subtitle scan...')

  void (async () => {
    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
    const sections = await plexClient.getSections()
    const missingSubtitles: string[] = []

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
          }
        }
      }
    }

    if (missingSubtitles.length === 0) {
      await client.sendMessage(message.chat.id, 'All media have matching subtitles.')
      return
    }

    const header = `*${missingSubtitles.length} media without matching subtitles:*\n\n`
    let batch = header

    for (const title of missingSubtitles) {
      const line = `• ${title}\n`

      batch += line
    }

    if (batch) {
      await client.sendMessage(message.chat.id, batch, undefined, 'Markdown')
    }
  })()

  return { step: 'idle' }
}
