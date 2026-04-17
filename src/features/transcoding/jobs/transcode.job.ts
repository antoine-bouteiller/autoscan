import { logger } from '#config/logger'
import { container, TOKENS } from '#core/container'
import { transcodeFile, transcodeQueue } from '#features/transcoding/services/transcode.service'
import { type IPlexClient } from '#integrations/plex/plex.service'
import { getCompleteMediaDetails } from '#media/metadata.service'
import { isError, logError } from '#shared/utils/error'

let isScanning = false

export const runTranscodeProcess = async () => {
  if (isScanning) {
    logger.warn('Transcode scan is already running, skipping...')
    return
  }

  isScanning = true
  logger.info('Starting transcode scan...')

  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
  const sections = await plexClient.getSections()

  for (const section of sections ?? []) {
    const mediasResult = await plexClient.getSectionMedia(section.key, section.type)

    const medias = mediasResult ?? []

    for (const media of medias) {
      const details = await getCompleteMediaDetails(Number(media.ratingKey))

      if (isError(details)) {
        logError(details, 'runTranscodeProcess')
        continue
      }

      await transcodeFile({
        file: details.file,
        mediaTitle: details.mediaTitle,
        mediaType: details.mediaType,
        originalLanguage: details.originalLanguage,
      })
    }
  }

  logger.info('Transcode scan finished')
  isScanning = false
}

export const getTranscodingStatus = () => {
  const queueStatus = transcodeQueue.getStatus()
  return isScanning || queueStatus.isProcessing
}
