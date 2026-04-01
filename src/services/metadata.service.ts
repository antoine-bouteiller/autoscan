import { container, TOKENS } from '#core/container'
import { FileNotFoundError, TmdbIdNotFoundError } from '#errors/metadata'
import { type IPlexClient, type MediaType } from '#integrations/plex.service'
import { type ITmdbClient } from '#integrations/tmdb.service'
import { createdOrUpdatedMedia, getMediaByIdAndType as getMediaFromDb } from '#repositories/media.repository'
import { type ISOCode1 } from '#types/iso_codes'
import { isError } from '#utils/error'

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

  const tmdbClient = container.resolve<ITmdbClient>(TOKENS.TMDB_CLIENT)
  const { data, type } = await tmdbClient.getTmdbMedia(tmdbId, mediaType)
  if (!data) {
    return { originalLanguage: 'en', preferredLanguage: 'en' }
  }

  const title = type === 'movie' ? data.title : data.name
  const language = data.original_language

  await createdOrUpdatedMedia({ originalLanguage: language, title, tmdbId, type: mediaType })

  return {
    originalLanguage: language,
    preferredLanguage: language,
  }
}

export const getCompleteMediaDetails = async (ratingKey: number) => {
  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)
  const plexMetadata = await plexClient.getPlexMetadata(ratingKey)

  if (isError(plexMetadata)) {
    return plexMetadata
  }

  const mediaTitle = buildMediaTitle(plexMetadata.grandparentTitle, plexMetadata.parentTitle, plexMetadata.title)

  const part = plexMetadata.Media[0]?.Part[0]

  if (!part?.file) {
    return new FileNotFoundError({ mediaTitle })
  }

  const tmdbId = extractTmdbIdFromPath(part.file)

  if (!tmdbId) {
    return new TmdbIdNotFoundError({ filePath: part.file, mediaTitle })
  }

  const mediaType: MediaType = plexMetadata.type === 'episode' ? 'show' : plexMetadata.type

  const { originalLanguage, preferredLanguage } = await getMediaLanguage(tmdbId, mediaType)

  return {
    file: part.file,
    mediaTitle,
    mediaType,
    originalLanguage,
    partsId: part.id,
    preferredLanguage,
    streams: part.Stream ?? [],
    tmdbId,
  }
}
