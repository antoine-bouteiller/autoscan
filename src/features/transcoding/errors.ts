import { Data } from 'effect'

interface MediaLanguageErrorFields {
  readonly cause?: unknown
  readonly language: string
  readonly mediaTitle: string
}

export class AudioStreamNotFoundError extends Data.TaggedError('AudioStreamNotFoundError')<MediaLanguageErrorFields & { readonly message: string }> {
  constructor(fields: MediaLanguageErrorFields) {
    super({ ...fields, message: `(${fields.mediaTitle}) No audio streams found for language ${fields.language}` })
  }
}

interface MediaErrorFields {
  readonly cause?: unknown
  readonly mediaTitle: string
}

export class VideoStreamNotFoundError extends Data.TaggedError('VideoStreamNotFoundError')<MediaErrorFields & { readonly message: string }> {
  constructor(fields: MediaErrorFields) {
    super({ ...fields, message: `(${fields.mediaTitle}) No video streams found` })
  }
}

export class NoStreamsKeptError extends Data.TaggedError('NoStreamsKeptError')<MediaErrorFields & { readonly message: string }> {
  constructor(fields: MediaErrorFields) {
    super({ ...fields, message: `(${fields.mediaTitle}) No audio tracks would be kept after processing` })
  }
}

export class FileNameInvalidError extends Data.TaggedError('FileNameInvalidError')<MediaErrorFields & { readonly message: string }> {
  constructor(fields: MediaErrorFields) {
    super({ ...fields, message: `(${fields.mediaTitle}) File name not initialized` })
  }
}

interface FileNotFoundErrorFields {
  readonly cause?: unknown
  readonly filePath: string
}

export class FileNotFoundError extends Data.TaggedError('FileNotFoundError')<FileNotFoundErrorFields & { readonly message: string }> {
  constructor(fields: FileNotFoundErrorFields) {
    super({ ...fields, message: `(${fields.filePath}) File not found` })
  }
}

interface FileAccessErrorFields extends FileNotFoundErrorFields {
  readonly operation: string
}

export class FileAccessError extends Data.TaggedError('FileAccessError')<FileAccessErrorFields & { readonly message: string }> {
  constructor(fields: FileAccessErrorFields) {
    super({ ...fields, message: `(${fields.filePath}) ${fields.operation} failed` })
  }
}

interface ReplacementRollbackErrorFields {
  readonly artifacts: readonly string[]
  readonly cause?: unknown
}

export class ReplacementRollbackError extends Data.TaggedError('ReplacementRollbackError')<
  ReplacementRollbackErrorFields & { readonly message: string }
> {
  constructor(fields: ReplacementRollbackErrorFields) {
    super({ ...fields, message: `Replacement rollback failed: ${fields.artifacts.join(', ')}` })
  }
}
