import { Schema } from 'effect'

import { NumberFromUnknown } from '@/shared/utils/schema'

const episodeValidator = Schema.Struct({
  title: Schema.String,
})

const episodeFileValidator = Schema.Struct({
  relativePath: Schema.String,
})

const seriesPayloadValidator = Schema.Struct({
  path: Schema.String,
  title: Schema.String,
  tmdbId: NumberFromUnknown,
})

export const sonarrValidator = Schema.Union([
  Schema.Struct({
    episodeFile: episodeFileValidator,
    episodes: Schema.Array(episodeValidator),
    eventType: Schema.Literal('Download'),
    series: seriesPayloadValidator,
  }),
  Schema.Struct({
    episodeFile: Schema.optional(episodeFileValidator),
    eventType: Schema.Literals(['EpisodeFileDelete', 'Rename']),
    series: seriesPayloadValidator,
  }),
  Schema.Struct({
    eventType: Schema.Literal('SeriesDelete'),
    series: seriesPayloadValidator,
  }),
  Schema.Struct({
    eventType: Schema.Literal('Test'),
  }),
])

export const seriesValidator = Schema.Struct({
  id: Schema.Finite,
  path: Schema.String,
})
