import { Schema } from 'effect'

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError, { readonly brand: unique symbol }>()('FileNotFoundError', {
  cause: Schema.optional(Schema.Unknown),
  mediaTitle: Schema.String,
}) {
  override get message() {
    return `[${this.mediaTitle}] No file found`
  }
}

export class TmdbIdNotFoundError extends Schema.TaggedError<TmdbIdNotFoundError, { readonly brand: unique symbol }>()('TmdbIdNotFoundError', {
  cause: Schema.optional(Schema.Unknown),
  filePath: Schema.String,
  mediaTitle: Schema.String,
}) {
  override get message() {
    return `[${this.mediaTitle}] No tmdbId found in path ${this.filePath}`
  }
}
