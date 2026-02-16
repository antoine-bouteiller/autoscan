import { FetchHttpClient } from '@effect/platform'
import { Effect, Schema } from 'effect'

import { AppConfig } from '@/config/app_config'
import { Series } from '@/schemas/sonarr'

import { makeArrClient } from './arr.service'

export class SonarrClient extends Effect.Service<SonarrClient>()('SonarrClient', {
  accessors: true,
  dependencies: [AppConfig.Default, FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const arr = yield* makeArrClient(config.SONARR_API_URL, config.SONARR_API_KEY, 'Sonarr')

    const getQueue = Effect.fn('SonarrClient.getQueue')(() => arr.getQueue())

    const removeQueueItem = Effect.fn('SonarrClient.removeQueueItem')((id: number, options: { blocklist: boolean; removeFromClient: boolean }) =>
      arr.removeQueueItem(id, options)
    )

    const refreshSeries = Effect.fn('SonarrClient.refreshSeries')((seriesId: number) =>
      arr
        .post('command', { name: 'RefreshSeries', seriesId })
        .pipe(Effect.catchAll((error) => Effect.logError(`(Sonarr) ${error instanceof Error ? error.message : JSON.stringify(error)}`)))
    )

    const renameSeries = Effect.fn('SonarrClient.renameSeries')((seriesId: number) =>
      arr
        .post('command', { name: 'RenameSeries', seriesIds: [seriesId] })
        .pipe(Effect.catchAll((error) => Effect.logError(`(Sonarr) ${error instanceof Error ? error.message : JSON.stringify(error)}`)))
    )

    const getSeriesByPath = Effect.fn('SonarrClient.getSeriesByPath')((filePath: string) =>
      arr.get('series', Schema.Array(Series)).pipe(
        Effect.map((seriesList) => seriesList.find((s) => filePath.startsWith(s.path))?.id),
        Effect.catchAll((error) => Effect.logError(`(Sonarr) ${String(error)}`).pipe(Effect.as(undefined)))
      )
    )

    return {
      getQueue,
      getSeriesByPath,
      refreshSeries,
      removeQueueItem,
      renameSeries,
    }
  }),
}) {}
