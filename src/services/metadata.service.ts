import { Effect } from 'effect'

import type { PlexMediaStream } from '@/schemas/plex'
import type { ISOCode1 } from '@/types/iso_codes'

import { FileNotFoundError, TmdbIdNotFoundError } from '@/errors'
import { PlexClient, type MediaType } from '@/integrations/plex.service'
import { TmdbClient } from '@/integrations/tmdb.service'
import { MediaRepository } from '@/repositories/media.repository'

export const extractTmdbIdFromPath = (filePath: string): number | undefined => {
  const match = /{tmdb-(.*?)}/g.exec(filePath)
  return match ? Number(match[1]) : undefined
}

export const buildMediaTitle = (grandparentTitle?: string, parentTitle?: string, title?: string): string =>
  [grandparentTitle, parentTitle, title].filter(Boolean).join(' - ')

export class MetadataService extends Effect.Service<MetadataService>()('MetadataService', {
  dependencies: [PlexClient.Default, TmdbClient.Default, MediaRepository.Default],
  effect: Effect.gen(function* () {
    const plexClient = yield* PlexClient
    const tmdbClient = yield* TmdbClient
    const mediaRepo = yield* MediaRepository

    const getMediaLanguage = Effect.fn('MetadataService.getMediaLanguage')(function* (tmdbId: number, mediaType: MediaType) {
      const cached = yield* mediaRepo.getMediaByIdAndType(tmdbId, mediaType)
      if (cached) {
        return {
          originalLanguage: cached.originalLanguage,
          preferredLanguage: cached.preferredLanguage,
        }
      }

      const { data, type } = yield* tmdbClient.getTmdbMedia(tmdbId, mediaType)
      if (!data) {
        return { originalLanguage: 'en' as ISOCode1, preferredLanguage: 'en' as ISOCode1 }
      }

      const title = type === 'movie' ? data.title : data.name
      const language = data.original_language
      yield* mediaRepo.createOrUpdateMedia(tmdbId, mediaType, title, language)

      return {
        originalLanguage: language,
        preferredLanguage: language,
      }
    })

    const getCompleteMediaDetails = Effect.fn('MetadataService.getCompleteMediaDetails')(function* (ratingKey: number) {
      const plexMetadata = yield* plexClient.getPlexMetadata(ratingKey)
      const mediaTitle = buildMediaTitle(plexMetadata?.grandparentTitle, plexMetadata?.parentTitle, plexMetadata?.title)
      const part = plexMetadata?.Media[0]?.Part[0]

      if (!plexMetadata || !part?.file) {
        return yield* new FileNotFoundError({ mediaTitle, message: `[${mediaTitle}] No file found` })
      }

      const tmdbId = extractTmdbIdFromPath(part.file)
      if (!tmdbId) {
        return yield* new TmdbIdNotFoundError({
          filePath: part.file,
          mediaTitle,
          message: `[${mediaTitle}] No tmdbId found in path: ${part.file}`,
        })
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

    const forEachMedia = <E, R>(processMedia: (details: MediaDetails) => Effect.Effect<void, E, R>) =>
      Effect.gen(function* () {
        const sections = yield* plexClient.getSections()

        for (const section of sections) {
          const medias = yield* plexClient.getSectionMedia(section.key, section.type)

          for (const media of medias) {
            const details = yield* getCompleteMediaDetails(Number(media.ratingKey)).pipe(
              Effect.catchTags({
                FileNotFoundError: () => Effect.void,
                TmdbIdNotFoundError: () => Effect.void,
              })
            )

            if (!details) {
              continue
            }
            yield* processMedia(details)
          }
        }
      })

    return { getMediaLanguage, getCompleteMediaDetails, forEachMedia }
  }),
}) {}

interface MediaDetails {
  file: string
  mediaTitle: string
  mediaType: MediaType
  originalLanguage: ISOCode1
  partsId: number
  preferredLanguage: ISOCode1
  streams: readonly PlexMediaStream[]
  tmdbId: number
}
