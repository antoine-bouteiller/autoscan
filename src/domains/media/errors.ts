import { Data } from 'effect'

interface FileNotFoundErrorFields {
  readonly cause?: unknown
  readonly mediaTitle: string
}

export class FileNotFoundError extends Data.TaggedError('FileNotFoundError')<FileNotFoundErrorFields & { readonly message: string }> {
  constructor(fields: FileNotFoundErrorFields) {
    super({ ...fields, message: `[${fields.mediaTitle}] No file found` })
  }
}

interface TmdbIdNotFoundErrorFields {
  readonly cause?: unknown
  readonly filePath: string
  readonly mediaTitle: string
}

export class TmdbIdNotFoundError extends Data.TaggedError('TmdbIdNotFoundError')<TmdbIdNotFoundErrorFields & { readonly message: string }> {
  constructor(fields: TmdbIdNotFoundErrorFields) {
    super({ ...fields, message: `[${fields.mediaTitle}] No tmdbId found in path ${fields.filePath}` })
  }
}
