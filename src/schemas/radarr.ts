import { Schema } from 'effect'

const MoviePayload = Schema.Struct({
  folderPath: Schema.String,
  title: Schema.String,
  tmdbId: Schema.Number,
})

const MovieFile = Schema.Struct({
  relativePath: Schema.String,
})

const RadarrMovieFileDelete = Schema.Struct({
  eventType: Schema.Literal('MovieFileDelete'),
  movie: MoviePayload,
  movieFile: Schema.optional(MovieFile),
})

const RadarrMovieDelete = Schema.Struct({
  deleteFiles: Schema.Boolean,
  eventType: Schema.Literal('MovieDelete'),
  movie: MoviePayload,
})

const RadarrDownload = Schema.Struct({
  eventType: Schema.Literal('Download'),
  movie: MoviePayload,
  movieFile: MovieFile,
})

const RadarrTest = Schema.Struct({
  eventType: Schema.Literal('Test'),
})

export const RadarrWebhook = Schema.Union(RadarrMovieFileDelete, RadarrMovieDelete, RadarrDownload, RadarrTest)
export type RadarrWebhook = typeof RadarrWebhook.Type

export const Movie = Schema.Struct({
  id: Schema.Number,
  path: Schema.String,
})
export type Movie = typeof Movie.Type
