import * as v from 'valibot'

const moviePayloadValidator = v.object({
  folderPath: v.string(),
  title: v.string(),
  tmdbId: v.number(),
})

const movieFileValidator = v.object({
  relativePath: v.string(),
})

export const radarrValidator = v.union([
  v.object({
    eventType: v.literal('MovieFileDelete'),
    movie: moviePayloadValidator,
    movieFile: v.optional(movieFileValidator),
  }),
  v.object({
    deleteFiles: v.boolean(),
    eventType: v.literal('MovieDelete'),
    movie: moviePayloadValidator,
  }),
  v.object({
    eventType: v.literal('Download'),
    movie: moviePayloadValidator,
    movieFile: movieFileValidator,
  }),
  v.object({
    eventType: v.literal('Test'),
  }),
])

export const movieValidator = v.object({
  id: v.number(),
  path: v.string(),
})
