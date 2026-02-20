import * as v from 'valibot'

const numberFromString = v.pipe(
  v.string(),
  v.transform((value) => Number(value)),
  v.check((value) => Number.isFinite(value), 'Expected numeric string')
)

const episodeValidator = v.object({
  title: v.string(),
})

const episodeFileValidator = v.object({
  relativePath: v.string(),
})

const seriesPayloadValidator = v.object({
  path: v.string(),
  title: v.string(),
  tmdbId: v.union([v.number(), numberFromString]),
})

export const sonarrValidator = v.union([
  v.object({
    episodeFile: episodeFileValidator,
    episodes: v.array(episodeValidator),
    eventType: v.literal('Download'),
    series: seriesPayloadValidator,
  }),
  v.object({
    episodeFile: v.optional(episodeFileValidator),
    eventType: v.union([v.literal('EpisodeFileDelete'), v.literal('Rename')]),
    series: seriesPayloadValidator,
  }),
  v.object({
    eventType: v.literal('SeriesDelete'),
    series: seriesPayloadValidator,
  }),
  v.object({
    eventType: v.literal('Test'),
  }),
])

export const seriesValidator = v.object({
  id: v.number(),
  path: v.string(),
})
