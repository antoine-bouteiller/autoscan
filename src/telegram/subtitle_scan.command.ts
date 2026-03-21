import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { container, TOKENS } from '#core/container'
import type { FfmpegClient } from '#integrations/ffmpeg.service'
import type { IPlexClient } from '#integrations/plex.service'
import type { ITelegramClient } from '#integrations/telegram.service'
import { getCompleteMediaDetails } from '#services/metadata.service'
import { isForcedSubtitle } from '#services/transcode/helpers/subtitle'
import type { ConversationState } from '#types/telegram'
import { isError, logError } from '#utils/error'
import type { TelegramMessageIn } from '#validators/telegram.validator'

const findSrtFiles = (mediaFilePath: string): string[] => {
  const dir = dirname(mediaFilePath)
  const mediaBase = basename(mediaFilePath, mediaFilePath.slice(mediaFilePath.lastIndexOf('.')))

  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((file) => file.startsWith(mediaBase) && file.endsWith('.srt'))
    .map((file) => join(dir, file))
}

export const subtitleScanCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  await client.sendMessage(message.chat.id, 'Starting subtitle scan...')

  void (async () => {
    const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
    const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
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

        const srtFiles = findSrtFiles(details.file)

        if (srtFiles.length === 0) {
          missingSubtitles.push(details.mediaTitle)
          continue
        }

        const probeResult = await ffmpegClient.ffprobe(details.file)
        if (isError(probeResult)) {
          continue
        }

        const hasNonForced = srtFiles.some((srtPath) => !isForcedSubtitle(srtPath, probeResult.duration))

        if (!hasNonForced) {
          missingSubtitles.push(details.mediaTitle)
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
