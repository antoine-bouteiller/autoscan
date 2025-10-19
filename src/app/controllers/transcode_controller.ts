import { resolve } from 'node:path'

import { tryCatch } from '@/app/exceptions/handler'
import {
  getMediaDetails,
  getSectionMedia,
  getSections,
  refreshSection,
} from '@/app/services/plex_service'
import { TranscodeService } from '@/app/services/transcode_service'
import { logger } from '@/config/logger'

export async function transcodeAll() {
  const sections = await getSections()

  for (const section of sections) {
    const medias = await tryCatch(getSectionMedia, section.key, section.type)

    if (!medias) continue

    for (const media of medias) {
      const details = await tryCatch(getMediaDetails, media)

      if (!details) continue

      const transcodeService = new TranscodeService(
        details.file,
        details.mediaTitle,
        details.originalLanguage
      )

      const executedTranscode = await tryCatch(transcodeService.transcodeFile)

      if (executedTranscode) {
        await refreshSection(section.key, resolve(details.file, '..'))
      }
    }
  }

  logger.info('Transcoding finished')
}
