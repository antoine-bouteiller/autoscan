import { logger } from '@/config/logger'
import { getCompleteMediaDetails } from '@/features/metadata/service'
import { getSectionMedia, getSections } from '@/integrations/plex/client'
import { logError, tryCatch } from '@/utils/error_handler'

import { transcodeFile, transcodeQueue } from './service'

let isScanning = false

export const runTranscodeProcess = async () => {
  if (isScanning) {
    logger.warn('Transcode scan is already running, skipping...')
    return
  }

  isScanning = true
  try {
    logger.info('Starting transcode scan...')
    const sections = await getSections()

    for (const section of sections ?? []) {
      const medias = (await tryCatch(getSectionMedia, section.key, section.type)) ?? []

      for (const media of medias) {
        const details = await tryCatch(getCompleteMediaDetails, media)

        if (!details) {
          continue
        }
        await transcodeFile(details.file, details.mediaTitle, details.originalLanguage, details.mediaType)
      }
    }

    logger.info('Transcode scan finished')
  } catch (error) {
    logError(error)
  } finally {
    isScanning = false
  }
}

export const getTranscodingStatus = () => {
  const queueStatus = transcodeQueue.getStatus()
  return isScanning || queueStatus.isProcessing
}
