import { Effect } from 'effect'

import { Plex, Tmdb } from '@/core/runtime.service'
import { FileNotFoundError, TmdbIdNotFoundError } from '@/domains/media/errors'
import { createdOrUpdatedMedia, getMediaByIdAndType as getMediaFromDb } from '@/domains/media/repositories/media.repository'
import { type MediaType } from '@/integrations/plex/plex.service'

export const extractTmdbIdFromPath = (filePath: string): number | undefined => {
  const match = /{tmdb-(?<id>.*?)}/g.exec(filePath)
  return match?.groups === undefined ? undefined : Number(match.groups['id'])
}

export const buildMediaTitle = (grandparentTitle?: string, parentTitle?: string, title?: string): string =>
  [grandparentTitle, parentTitle, title].filter(Boolean).join(' - ')

export const getMediaLanguage = (tmdbId: number, mediaType: MediaType) =>
  Effect.gen(function* () {
    const cachedMedia = yield* getMediaFromDb(tmdbId, mediaType)
    if (cachedMedia !== undefined) {
      return { originalLanguage: cachedMedia.originalLanguage, preferredLanguage: cachedMedia.preferredLanguage }
    }

    const tmdbClient = yield* Tmdb
    const media = yield* tmdbClient.getTmdbMedia(tmdbId, mediaType).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (media === undefined) {
      return { originalLanguage: 'en' as const, preferredLanguage: 'en' as const }
    }

    if (media.data === undefined) {
      return { originalLanguage: 'en' as const, preferredLanguage: 'en' as const }
    }

    const title = media.type === 'movie' ? media.data.title : media.data.name
    const language = media.data.original_language
    yield* createdOrUpdatedMedia({ originalLanguage: language, title, tmdbId, type: mediaType })
    return { originalLanguage: language, preferredLanguage: language }
  })

export const getCompleteMediaDetails = (ratingKey: number) =>
  Effect.gen(function* () {
    const plexClient = yield* Plex
    const plexMetadata = yield* plexClient.getPlexMetadata(ratingKey)
    const mediaTitle = buildMediaTitle(plexMetadata.grandparentTitle, plexMetadata.parentTitle, plexMetadata.title)
    const part = plexMetadata.Media[0]?.Part[0]

    if (part?.file === undefined) {
      return yield* new FileNotFoundError({ mediaTitle })
    }

    const tmdbId = extractTmdbIdFromPath(part.file)
    if (tmdbId === undefined || Number.isNaN(tmdbId)) {
      return yield* new TmdbIdNotFoundError({ filePath: part.file, mediaTitle })
    }

    const mediaType: MediaType = plexMetadata.type === 'episode' ? 'show' : plexMetadata.type
    const { originalLanguage, preferredLanguage } = yield* getMediaLanguage(tmdbId, mediaType)

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
  })
