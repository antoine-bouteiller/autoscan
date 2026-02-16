import { Effect, Layer } from 'effect'

import type { TmdbMedia } from '@/schemas/tmdb'

import { TmdbClient } from '@/integrations/tmdb.service'

export const tmdbMediaMap = new Map<string, TmdbMedia>()
export let tmdbCallCount = 0

export const resetTmdbMock = () => {
  tmdbMediaMap.clear()
  tmdbCallCount = 0
}

export const MockTmdbLayer = Layer.succeed(
  TmdbClient,
  TmdbClient.make({
    getTmdbMedia: (tmdbId: number, mediaType: 'movie' | 'show') => {
      tmdbCallCount++
      const key = `${tmdbId}-${mediaType}`
      return Effect.succeed(tmdbMediaMap.get(key) ?? { data: undefined, type: 'movie' as const })
    },
    getTmdbMovie: () => Effect.succeed(undefined),
    getTmdbTvShow: () => Effect.succeed(undefined),
  })
)
