import type { iso2 } from '@/types/iso_codes'
import type { MediaType, PlexMediaStream } from '@/types/plex'

import { getMediaByIdAndType } from '@/app/services/media_service'
import { updateStream } from '@/app/services/plex_service'
import { getLanguageByIdAndType } from '@/app/services/tmdb_service'
import { logger } from '@/config/logger'

export const getLanguage = async (tmdbId: number, mediaType: MediaType) => {
  const mediaDetails = await getMediaByIdAndType(tmdbId, mediaType)

  if (mediaDetails) {
    return mediaDetails.originalLanguage as iso2
  }

  if (tmdbId) {
    return getLanguageByIdAndType(tmdbId, mediaType)
  }

  return 'eng'
}

interface UpdateLanguageParams {
  mediaTitle: string
  streams: PlexMediaStream[]
  originalLanguage: iso2
  partsId: number
}

export const handleUpdateLanguage = async (params: UpdateLanguageParams) => {
  const { mediaTitle, streams, originalLanguage, partsId } = params
  const audioStream = streams.find(
    (stream: PlexMediaStream) =>
      stream.streamType === 2 && stream.languageCode === originalLanguage.replace('fre', 'fra')
  )
  if (!audioStream) {
    logger.warn(`[${mediaTitle}] No ${originalLanguage} audio stream found`)
    return
  }
  if (!audioStream.selected) {
    logger.info(`[${mediaTitle}] Setting audio in ${originalLanguage}`)
    await updateStream({
      originalLanguage, partsId, subtitleStreamId: audioStream.id, type: 'audio',
    })
  }
}
