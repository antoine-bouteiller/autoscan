import type { iso2 } from '@/types/iso_codes'
import type { PlexMediaStream } from '@/types/plex'

import { updateStream } from '@/app/services/integrations/plex_service'
import { normalizeLanguageCode } from '@/app/services/media/media_orchestration_service'
import { logger } from '@/config/logger'

interface UpdateLanguageParams {
  mediaTitle: string
  streams: PlexMediaStream[]
  originalLanguage: iso2
  partsId: number
}

export const handleUpdateLanguage = async (params: UpdateLanguageParams) => {
  const { mediaTitle, streams, originalLanguage, partsId } = params

  const normalizedLanguage = normalizeLanguageCode(originalLanguage)

  const audioStream = streams.find(
    (stream: PlexMediaStream) =>
      stream.streamType === 2 && stream.languageCode === normalizedLanguage
  )

  if (!audioStream) {
    logger.warn(`[${mediaTitle}] No ${originalLanguage} audio stream found`)
    return
  }

  if (!audioStream.selected) {
    logger.info(`[${mediaTitle}] Setting audio in ${originalLanguage}`)

    await updateStream(partsId, normalizedLanguage === 'fra' ? 0 : audioStream.id, 'audio')
  }
}
