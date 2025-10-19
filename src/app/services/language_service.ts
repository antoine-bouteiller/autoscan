import type { iso2 } from '@/types/iso_codes'
import type { MediaType, PlexMediaStream } from '@/types/plex'

import { getMediaByIdAndType } from '@/app/services/media_service'
import { updateStream } from '@/app/services/plex_service'
import { getLanguageByIdAndType } from '@/app/services/tmdb_service'
import { logger } from '@/config/logger'

export async function getLanguage(tmdbId: number, mediaType: MediaType) {
  const mediaDetails = await getMediaByIdAndType(tmdbId, mediaType)

  let originalLanguage: iso2
  if (!mediaDetails) {
    originalLanguage = tmdbId ? await getLanguageByIdAndType(tmdbId, mediaType) : 'eng'
  } else {
    originalLanguage = mediaDetails.originalLanguage as iso2
  }

  return originalLanguage
}

export async function handleUpdateLanguage(
  mediaTitle: string,
  streams: PlexMediaStream[],
  originalLanguage: iso2,
  partsId: number
) {
  const audioStream = streams.find(
    (stream: PlexMediaStream) =>
      2 === stream.streamType && stream.languageCode === originalLanguage.replace('fre', 'fra')
  )
  if (!audioStream) {
    logger.warn(`[${mediaTitle}] No ${originalLanguage} audio stream found`)
    return
  }
  if (!audioStream.selected) {
    logger.info(`[${mediaTitle}] Setting audio in ${originalLanguage}`)
    await updateStream(partsId, audioStream.id, originalLanguage, 'audio')
  }
}
