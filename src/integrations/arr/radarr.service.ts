import { FetchHttpClient } from '@effect/platform'
import { Effect, Schema } from 'effect'

import { AppConfig } from '@/config/app_config'
import { Movie } from '@/schemas/radarr'

import { makeArrClient } from './arr.service'

export class RadarrClient extends Effect.Service<RadarrClient>()('RadarrClient', {
  accessors: true,
  dependencies: [AppConfig.Default, FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const arr = yield* makeArrClient(config.RADARR_API_URL, config.RADARR_API_KEY, 'Radarr')

    const getQueue = Effect.fn('RadarrClient.getQueue')(() => arr.getQueue())

    const removeQueueItem = Effect.fn('RadarrClient.removeQueueItem')((id: number, options: { blocklist: boolean; removeFromClient: boolean }) =>
      arr.removeQueueItem(id, options)
    )

    const refreshMovie = Effect.fn('RadarrClient.refreshMovie')((movieId: number) =>
      arr
        .post('command', { movieId, name: 'RefreshMovie' })
        .pipe(Effect.catchAll((error) => Effect.logError(`(Radarr) ${error instanceof Error ? error.message : JSON.stringify(error)}`)))
    )

    const renameMovie = Effect.fn('RadarrClient.renameMovie')((movieId: number) =>
      arr
        .post('command', { files: [], movieId, name: 'RenameMovie' })
        .pipe(Effect.catchAll((error) => Effect.logError(`(Radarr) ${error instanceof Error ? error.message : JSON.stringify(error)}`)))
    )

    const getMovieByPath = Effect.fn('RadarrClient.getMovieByPath')((filePath: string) =>
      arr.get('movie', Schema.Array(Movie)).pipe(
        Effect.map((movies) => movies.find((m) => filePath.startsWith(m.path))?.id),
        Effect.catchAll((error) => Effect.logError(`(Radarr) ${String(error)}`).pipe(Effect.as(undefined)))
      )
    )

    return {
      getMovieByPath,
      getQueue,
      refreshMovie,
      removeQueueItem,
      renameMovie,
    }
  }),
}) {}
