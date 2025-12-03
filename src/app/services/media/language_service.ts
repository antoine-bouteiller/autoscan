import type { PlexMediaStream } from '@/types/plex'

import { updateStream } from '@/app/integrations/plex/plex_client'
import { logger } from '@/config/logger'
import { type ISOCode1 } from '@/types/iso_codes'
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
    logger.warn(`[${mediaTitle}] No ${originalLanguage} audio stream found`)
    return
  }

  if (!audioStream.selected) {
    logger.info(`[${mediaTitle}] Setting audio in ${originalLanguage}`)

    await updateStream(partsId, originalLanguage === 'fr' ? 0 : audioStream.id, 'audio')
  }
}
