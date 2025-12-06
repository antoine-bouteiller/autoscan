import type { ISOCode1 } from '@/types/iso_codes'

import { logger } from '@/config/logger'
import { type PlexMediaStream, updateStream } from '@/integrations/plex/client'
import { normalizeToIso1 } from '@/utils/iso_codes'

interface UpdateLanguageParams {
  mediaTitle: string
  originalLanguage: ISOCode1
  partsId: number
  streams: PlexMediaStream[]
}

export const handleUpdateLanguage = async (params: UpdateLanguageParams) => {
  const { mediaTitle, originalLanguage, partsId, streams } = params

  const audioStream = streams.find(
    (stream: PlexMediaStream) =>
      stream.streamType === 2 && normalizeToIso1(stream.languageCode) === originalLanguage
  )

  if (!audioStream) {
    logger.warn(`No ${originalLanguage} audio stream found`, 'Language', mediaTitle)
    return
  }

  if (!audioStream.selected) {
    logger.info(`Setting audio in ${originalLanguage}`, 'Language', mediaTitle)

    await updateStream(partsId, originalLanguage === 'fr' ? 0 : audioStream.id, 'audio')
  }
}
