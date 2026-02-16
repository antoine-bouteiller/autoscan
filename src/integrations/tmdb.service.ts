import { FetchHttpClient, HttpClient } from '@effect/platform'
import { Effect, Redacted } from 'effect'

import type { MediaType } from '@/integrations/plex.service'

import { AppConfig } from '@/config/app_config'
import { makeHttpClient } from '@/config/http_client'
import { type TmdbMedia, type TmdbMovie, TmdbMovieResponse, type TmdbTV, TmdbTvResponse } from '@/schemas/tmdb'

export class TmdbClient extends Effect.Service<TmdbClient>()('TmdbClient', {
  accessors: true,
  dependencies: [AppConfig.Default, FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const client = yield* HttpClient.HttpClient

    const api = makeHttpClient(client, config.TMDB_API_URL, {
      Authorization: `Bearer ${Redacted.value(config.TMDB_API_TOKEN)}`,
    })

    const getTmdbMovie = Effect.fn('TmdbClient.getTmdbMovie')(
      (tmdbId: number): Effect.Effect<TmdbMovie | undefined> =>
        api
          .get(`movie/${tmdbId}`, TmdbMovieResponse)
          .pipe(Effect.catchAll((error) => Effect.logError(`(TMDB) ${String(error)}`).pipe(Effect.as(undefined))))
    )

    const getTmdbTvShow = Effect.fn('TmdbClient.getTmdbTvShow')(
      (tmdbId: number): Effect.Effect<TmdbTV | undefined> =>
        api
          .get(`tv/${tmdbId}`, TmdbTvResponse)
          .pipe(Effect.catchAll((error) => Effect.logError(`(TMDB) ${String(error)}`).pipe(Effect.as(undefined))))
    )

    const getTmdbMedia = Effect.fn('TmdbClient.getTmdbMedia')((tmdbId: number, mediaType: MediaType): Effect.Effect<TmdbMedia> => {
      if (mediaType === 'movie') {
        return getTmdbMovie(tmdbId).pipe(Effect.map((data) => ({ data, type: 'movie' as const })))
      }
      return getTmdbTvShow(tmdbId).pipe(Effect.map((data) => ({ data, type: 'tv' as const })))
    })

    return {
      getTmdbMedia,
      getTmdbMovie,
      getTmdbTvShow,
    }
  }),
}) {}
