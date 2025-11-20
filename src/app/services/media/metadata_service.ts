import { iso1ToIso2T, type ISOCode1 } from '@/types/iso_codes'
import type { MediaType, PlexMedia } from '@/types/plex'

import { getPlexMetadata } from '@/app/integrations/plex/plex_client'
import { getTmdbMedia } from '@/app/integrations/tmdb/tmdb_client'

import { createdOrUpdatedMedia, getMediaByIdAndType as getMediaFromDb } from './media_service'

export const extractTmdbIdFromPath = (filePath: string): number | undefined => {
  const match = /{tmdb-(.*?)}/g.exec(filePath)
  return match ? Number(match[1]) : undefined
}

export const buildMediaTitle = (
  grandparentTitle?: string,
  parentTitle?: string,
  title?: string
): string => [grandparentTitle, parentTitle, title].filter(Boolean).join(' - ')

export const getOriginalLanguage = async (
  tmdbId: number,
  mediaType: MediaType
): Promise<ISOCode1> => {
  const cachedMedia = await getMediaFromDb(tmdbId, mediaType)
  if (cachedMedia) {
    return cachedMedia.originalLanguage as ISOCode1
  }

  const tmdbData = await getTmdbMedia(tmdbId, mediaType)
  if (!tmdbData) {
    return 'en'
  }

  // TMDB returns ISO 639-1 (2-character) codes
  const language = tmdbData.original_language in iso1ToIso2T ? tmdbData.original_language : 'en'
  const title = mediaType === 'movie' ? tmdbData.title : tmdbData.name

  await createdOrUpdatedMedia(tmdbId, mediaType, title, language)

  return language
}

export const getCompleteMediaDetails = async (plexMedia: PlexMedia) => {
  const mediaTitle = buildMediaTitle(
    plexMedia.grandparentTitle,
    plexMedia.parentTitle,
    plexMedia.title
  )

  const file = plexMedia.Media[0]?.Part[0]?.file

  if (!file) {
    throw new Error(`[${mediaTitle}] No file found`)
  }

  const tmdbId = extractTmdbIdFromPath(file)

  if (!tmdbId) {
    throw new Error(`[${mediaTitle}] No tmdbId found in path: ${file}`)
  }

  const mediaType: MediaType = plexMedia.type === 'episode' ? 'show' : plexMedia.type

  const originalLanguage = await getOriginalLanguage(tmdbId, mediaType)

  const plexMetadata = await getPlexMetadata(Number(plexMedia.ratingKey))
  const part = plexMetadata?.Media[0]?.Part[0]

  if (!part) {
    throw new Error(`[${mediaTitle}] No part found in Plex metadata`)
  }

  return {
    file,
    mediaTitle,
    mediaType,
    originalLanguage,
    partsId: part.id,
    streams: part.Stream,
    tmdbId,
  }
}
