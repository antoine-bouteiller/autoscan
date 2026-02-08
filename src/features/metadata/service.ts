import type { TmdbClient } from '@/integrations/tmdb/client'

import { container, TOKENS } from '@/core/bootstrap'
import { createdOrUpdatedMedia, getMediaByIdAndType as getMediaFromDb } from '@/features/media/service'
import { type MediaType, type PlexClient } from '@/integrations/plex/client'
import { type PlexMedia } from '@/integrations/plex/validators'
import { type ISOCode1 } from '@/types/iso_codes'

import { FileNotFoundError, PartNotFoundError, TmdbIdNotFoundError } from './errors'

export const extractTmdbIdFromPath = (filePath: string): number | undefined => {
  const match = /{tmdb-(.*?)}/g.exec(filePath)
  return match ? Number(match[1]) : undefined
}

export const buildMediaTitle = (grandparentTitle?: string, parentTitle?: string, title?: string): string =>
  [grandparentTitle, parentTitle, title].filter(Boolean).join(' - ')

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

  const tmdbClient = container.resolve<TmdbClient>(TOKENS.TMDB_CLIENT)
  const { data, type } = await tmdbClient.getTmdbMedia(tmdbId, mediaType)
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
  const mediaTitle = buildMediaTitle(plexMedia.grandparentTitle, plexMedia.parentTitle, plexMedia.title)

  const file = plexMedia.Media[0]?.Part[0]?.file

  if (!file) {
    throw new FileNotFoundError(mediaTitle)
  }

  const tmdbId = extractTmdbIdFromPath(file)

  if (!tmdbId) {
    throw new TmdbIdNotFoundError(mediaTitle, file)
  }

  const mediaType: MediaType = plexMedia.type === 'episode' ? 'show' : plexMedia.type

  const { originalLanguage, preferredLanguage } = await getMediaLanguage(tmdbId, mediaType)

  const plexClient = container.resolve<PlexClient>(TOKENS.PLEX_CLIENT)
  const plexMetadata = await plexClient.getPlexMetadata(Number(plexMedia.ratingKey))
  const part = plexMetadata?.Media[0]?.Part[0]

  if (!part) {
    throw new PartNotFoundError(mediaTitle)
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
