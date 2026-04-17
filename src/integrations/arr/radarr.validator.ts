import { z } from 'zod'

const moviePayloadValidator = z.object({
  folderPath: z.string(),
  title: z.string(),
  tmdbId: z.number(),
})

const movieFileValidator = z.object({
  relativePath: z.string(),
})

export const radarrValidator = z.union([
  z.object({
    eventType: z.literal('MovieFileDelete'),
    movie: moviePayloadValidator,
    movieFile: movieFileValidator.optional(),
  }),
  z.object({
    deleteFiles: z.boolean(),
    eventType: z.literal('MovieDelete'),
    movie: moviePayloadValidator,
  }),
  z.object({
    eventType: z.literal('Download'),
    movie: moviePayloadValidator,
    movieFile: movieFileValidator,
  }),
  z.object({
    eventType: z.literal('Test'),
  }),
])

export const movieValidator = z.object({
  id: z.number(),
  path: z.string(),
})
