import { z } from 'zod'

export const radarrValidator = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('DeleteFile'),
    movie: z.object({
      folderPath: z.string(),
      title: z.string(),
      tmdbId: z.coerce.number(),
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
      folderPath: z.string(),
      title: z.string(),
      tmdbId: z.coerce.number(),
    }),
    movieFile: z.object({
      relativePath: z.string(),
    }),
  }),
  z.object({
    eventType: z.literal('Test'),
  }),
])
