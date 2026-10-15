import { Schema } from 'effect'

const MediaErrorFields = {
  cause: Schema.optional(Schema.Unknown),
  mediaTitle: Schema.String,
}

export class AudioStreamNotFoundError extends Schema.TaggedError<AudioStreamNotFoundError, { readonly brand: unique symbol }>()(
  'AudioStreamNotFoundError',
  {
    ...MediaErrorFields,
    language: Schema.String,
  }
) {
  override get message() {
    return `(${this.mediaTitle}) No audio streams found for language ${this.language}`
  }
}

export class VideoStreamNotFoundError extends Schema.TaggedError<VideoStreamNotFoundError, { readonly brand: unique symbol }>()(
  'VideoStreamNotFoundError',
  MediaErrorFields
) {
  override get message() {
    return `(${this.mediaTitle}) No video streams found`
  }
}

export class NoStreamsKeptError extends Schema.TaggedError<NoStreamsKeptError, { readonly brand: unique symbol }>()(
  'NoStreamsKeptError',
  MediaErrorFields
) {
  override get message() {
    return `(${this.mediaTitle}) No audio tracks would be kept after processing`
  }
}

export class FileNameInvalidError extends Schema.TaggedError<FileNameInvalidError, { readonly brand: unique symbol }>()(
  'FileNameInvalidError',
  MediaErrorFields
) {
  override get message() {
    return `(${this.mediaTitle}) File name not initialized`
  }
}

const FileNotFoundErrorFields = {
  cause: Schema.optional(Schema.Unknown),
  filePath: Schema.String,
}

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError, { readonly brand: unique symbol }>()(
  'FileNotFoundError',
  FileNotFoundErrorFields
) {
  override get message() {
    return `(${this.filePath}) File not found`
  }
}

export class FileAccessError extends Schema.TaggedError<FileAccessError, { readonly brand: unique symbol }>()('FileAccessError', {
  ...FileNotFoundErrorFields,
  operation: Schema.String,
}) {
  override get message() {
    return `(${this.filePath}) ${this.operation} failed`
  }
}

export class ReplacementRollbackError extends Schema.TaggedError<ReplacementRollbackError, { readonly brand: unique symbol }>()(
  'ReplacementRollbackError',
  {
    artifacts: Schema.Array(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  }
) {
  override get message() {
    return `Replacement rollback failed: ${this.artifacts.join(', ')}`
  }
}
