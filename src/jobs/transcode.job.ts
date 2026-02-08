import type { PlexClient } from '@/integrations/plex.service'

import { logger } from '@/config/logger'
import { container, TOKENS } from '@/core/bootstrap'
import { getCompleteMediaDetails } from '@/services/metadata.service'
import { transcodeFile, transcodeQueue } from '@/services/transcode/transcode.service'
import { logError, tryCatch } from '@/utils/error_handler'

let isScanning = false

export const runTranscodeProcess = async () => {
  if (isScanning) {
    logger.warn('Transcode scan is already running, skipping...')
    return
  }

  isScanning = true
  try {
    logger.info('Starting transcode scan...')
    const plexClient = container.resolve<PlexClient>(TOKENS.PLEX_CLIENT)
    const sections = await plexClient.getSections()

    for (const section of sections ?? []) {
      const medias = (await tryCatch(plexClient.getSectionMedia.bind(plexClient), section.key, section.type)) ?? []

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
