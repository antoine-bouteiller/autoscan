import { z } from 'zod'

const episodeValidator = z.object({
  title: z.string(),
})

const episodeFileValidator = z.object({
  relativePath: z.string(),
})

const seriesPayloadValidator = z.object({
  path: z.string(),
  title: z.string(),
  tmdbId: z.coerce.number(),
})

export const sonarrValidator = z.union([
  z.object({
    episodeFile: episodeFileValidator,
    episodes: z.array(episodeValidator),
    eventType: z.literal('Download'),
    series: seriesPayloadValidator,
  }),
  z.object({
    episodeFile: episodeFileValidator.optional(),
    eventType: z.union([z.literal('EpisodeFileDelete'), z.literal('Rename')]),
    series: seriesPayloadValidator,
  }),
  z.object({
    eventType: z.literal('SeriesDelete'),
    series: seriesPayloadValidator,
  }),
  z.object({
    eventType: z.literal('Test'),
  }),
])

export const seriesValidator = z.object({
  id: z.number(),
  path: z.string(),
})
