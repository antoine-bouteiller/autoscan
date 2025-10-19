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
      tmdbId: z.coerce.number(),
      path: z.string(),
      title: z.string(),
    }),
  }),
  z.object({
    eventType: z.literal(['EpisodeFileDeleted', 'EpisodeFileRenamed']),
    episodeFile: z
      .object({
        relativePath: z.string(),
      })
      .optional(),
    series: z.object({
      tmdbId: z.coerce.number(),
      path: z.string(),
      title: z.string(),
    }),
  }),
  z.object({
    eventType: z.literal('Test'),
  }),
])
