import type { ISOCode1 } from '@/types/iso_codes'

import { logger } from '@/config/logger'
import { type PlexMediaStream, updateStream } from '@/integrations/plex'
import { normalizeToIso1 } from '@/utils/iso_codes'

interface UpdateLanguageParams {
  mediaTitle: string
  partsId: number
  preferredLanguage: ISOCode1
  streams: PlexMediaStream[]
}

export const handleUpdateLanguage = async (params: UpdateLanguageParams) => {
  const { mediaTitle, partsId, preferredLanguage, streams } = params

  const audioStream = streams.find((stream: PlexMediaStream) => stream.streamType === 2 && normalizeToIso1(stream.languageCode) === preferredLanguage)

  if (!audioStream) {
    logger.warn(`No ${preferredLanguage} audio stream found`, 'Language', mediaTitle)
    return
  }

  if (!audioStream.selected) {
    logger.info(`Setting audio in ${preferredLanguage}`, 'Language', mediaTitle)

    await updateStream(partsId, audioStream.id, 'audio')

    if (preferredLanguage === 'fr') {
      await updateStream(partsId, 0, 'subtitle')
    }
  }
}
