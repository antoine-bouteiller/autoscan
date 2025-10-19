import { z } from 'zod'

export const radarrValidator = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('DeleteFile'),
    movie: z.object({
      tmdbId: z.coerce.number(),
      folderPath: z.string(),
      title: z.string(),
    }),
    movieFile: z
      .object({
        relativePath: z.string(),
      })
      .optional(),
  }),
  z.object({
    eventType: z.literal('Download'),
    movie: z.object({
      tmdbId: z.coerce.number(),
      folderPath: z.string(),
      title: z.string(),
    }),
    movieFile: z.object({
      relativePath: z.string(),
    }),
  }),
  z.object({
    eventType: z.literal('Test'),
  }),
])
