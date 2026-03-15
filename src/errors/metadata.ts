import { createTaggedError } from '#utils/error'

export class FileNotFoundError extends createTaggedError({
  name: 'FileNotFoundError',
  message: '[$mediaTitle] No file found',
}) {}

export class TmdbIdNotFoundError extends createTaggedError({
  name: 'TmdbIdNotFoundError',
  message: '[$mediaTitle] No tmdbId found in path $filePath',
}) {}
