import { resolve } from 'node:path'

import { handleError, tryCatch } from '@/app/exceptions/handler'
import {
  getSectionMedia,
  getSections,
  refreshSection,
} from '@/app/services/integrations/plex_service'
import { getCompleteMediaDetails } from '@/app/services/media/media_orchestration_service'
import { TranscodeOrchestrator } from '@/app/services/transcode/transcode_orchestrator'
import { logger } from '@/config/logger'

let isTranscoding = false

export const runTranscodeProcess = async () => {
  if (isTranscoding) {
    logger.warn('Transcode process is already running, skipping...')
    return
  }

  isTranscoding = true
  try {
    logger.info('Starting transcode process...')
    const sections = await getSections()

    for (const section of sections) {
      const medias = (await tryCatch(getSectionMedia, section.key, section.type)) ?? []

      for (const media of medias) {
        const details = await tryCatch(getCompleteMediaDetails, media)

        if (!details) {
          continue
        }

        const transcodeService = new TranscodeOrchestrator(
          details.file,
          details.mediaTitle,
          details.originalLanguage
        )

        const executedTranscode = await tryCatch(() => transcodeService.transcodeFile())

        if (executedTranscode) {
          await refreshSection(section.key, resolve(details.file, '..'))
        }
      }
    }

    logger.info('Transcoding finished')
  } catch (error) {
    handleError(error)
  } finally {
    isTranscoding = false
  }
}

export const getTranscodingStatus = () => isTranscoding
