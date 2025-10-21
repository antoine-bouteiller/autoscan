import { z } from 'zod'

export const sonarrValidator = z.discriminatedUnion('eventType', [
  z.object({
    episodeFile: z.object({
      relativePath: z.string(),
    }),
    episodes: z.array(
      z.object({
        title: z.string(),
      })
    ),
    eventType: z.literal('Download'),
    series: z.object({
      path: z.string(), title: z.string(), tmdbId: z.coerce.number(),
    }),
  }),
  z.object({
    episodeFile: z
      .object({
        relativePath: z.string(),
      })
      .optional(), eventType: z.literal(['EpisodeFileDeleted', 'EpisodeFileRenamed']), series: z.object({
      path: z.string(), title: z.string(), tmdbId: z.coerce.number(),
    }),
  }),
  z.object({
    eventType: z.literal('Test'),
  }),
])
