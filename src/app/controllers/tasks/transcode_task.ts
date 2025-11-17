import { handleError, tryCatch } from '@/app/exceptions/handler'
import { getSectionMedia, getSections } from '@/app/integrations/plex/plex_client'
import { getCompleteMediaDetails } from '@/app/services/media/metadata_service'
import { transcodeQueue } from '@/app/services/transcode/helpers/transcode_queue'
import { transcodeFile } from '@/app/services/transcode/transcode_service'
import { logger } from '@/config/logger'

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

    for (const section of sections) {
      const medias = (await tryCatch(getSectionMedia, section.key, section.type)) ?? []

      for (const media of medias) {
        const details = await tryCatch(getCompleteMediaDetails, media)

        if (!details) {
          continue
        }
        await transcodeFile(
          details.file,
          details.mediaTitle,
          details.originalLanguage,
          details.mediaType
        )
      }
    }

    logger.info('Transcode scan finished')
  } catch (error) {
    handleError(error)
  } finally {
    isScanning = false
  }
}

export const getTranscodingStatus = () => {
  const queueStatus = transcodeQueue.getStatus()
  return isScanning || queueStatus.isProcessing
}
