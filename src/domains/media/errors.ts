import { createTaggedError } from '#/shared/utils/error'

export class FileNotFoundError extends createTaggedError({
  message: '[$mediaTitle] No file found',
  name: 'FileNotFoundError',
}) {}

export class TmdbIdNotFoundError extends createTaggedError({
  message: '[$mediaTitle] No tmdbId found in path $filePath',
  name: 'TmdbIdNotFoundError',
}) {}
