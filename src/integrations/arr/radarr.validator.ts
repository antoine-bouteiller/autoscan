import { Schema } from 'effect'

const moviePayloadValidator = Schema.Struct({
  folderPath: Schema.String,
  title: Schema.String,
  tmdbId: Schema.Finite,
})

const movieFileValidator = Schema.Struct({
  relativePath: Schema.String,
})

export const radarrValidator = Schema.Union([
  Schema.Struct({
    eventType: Schema.Literal('MovieFileDelete'),
    movie: moviePayloadValidator,
    movieFile: Schema.optional(movieFileValidator),
  }),
  Schema.Struct({
    deleteFiles: Schema.Boolean,
    eventType: Schema.Literal('MovieDelete'),
    movie: moviePayloadValidator,
  }),
  Schema.Struct({
    eventType: Schema.Literal('Download'),
    movie: moviePayloadValidator,
    movieFile: movieFileValidator,
  }),
  Schema.Struct({
    eventType: Schema.Literal('Test'),
  }),
])

export const movieValidator = Schema.Struct({
  id: Schema.Finite,
  path: Schema.String,
})
