import { createdOrUpdatedMedia, getMediaByIdAndType as getMediaFromDb } from '@/features/media'
import { getPlexMetadata, type MediaType, type PlexMedia } from '@/integrations/plex'
import { getTmdbMedia } from '@/integrations/tmdb'
import { type ISOCode1 } from '@/types/iso_codes'

export const extractTmdbIdFromPath = (filePath: string): number | undefined => {
  const match = /{tmdb-(.*?)}/g.exec(filePath)
  return match ? Number(match[1]) : undefined
}

export const buildMediaTitle = (
  grandparentTitle?: string,
  parentTitle?: string,
  title?: string
): string => [grandparentTitle, parentTitle, title].filter(Boolean).join(' - ')

export const getMediaLanguage = async (
  tmdbId: number,
  mediaType: MediaType
): Promise<{ originalLanguage: ISOCode1; preferredLanguage: ISOCode1 }> => {
  const cachedMedia = await getMediaFromDb(tmdbId, mediaType)
  if (cachedMedia) {
    return {
      originalLanguage: cachedMedia.originalLanguage,
      preferredLanguage: cachedMedia.preferredLanguage,
    }
  }

  const { data, type } = await getTmdbMedia(tmdbId, mediaType)
  if (!data) {
    return { originalLanguage: 'en', preferredLanguage: 'en' }
  }

  const title = type === 'movie' ? data.title : data.name
  const language = data.original_language

  await createdOrUpdatedMedia(tmdbId, mediaType, title, language)

  return {
    originalLanguage: language,
    preferredLanguage: language,
  }
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

  const { originalLanguage, preferredLanguage } = await getMediaLanguage(tmdbId, mediaType)

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
    preferredLanguage,
    streams: part.Stream ?? [],
    tmdbId,
  }
}
