import { Schema } from 'effect'

export class NetworkError extends Schema.TaggedError<NetworkError>()('NetworkError', {
  message: Schema.String,
  originalMessage: Schema.String,
  serviceName: Schema.String,
}) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()('ValidationError', {
  errors: Schema.String,
  message: Schema.String,
}) {}

export class CommandExecutionError extends Schema.TaggedError<CommandExecutionError>()('CommandExecutionError', {
  command: Schema.optional(Schema.String),
  exitCode: Schema.optional(Schema.Number),
  message: Schema.String,
  stderr: Schema.optional(Schema.String),
}) {}

export class CloudflareZoneNotFoundError extends Schema.TaggedError<CloudflareZoneNotFoundError>()('CloudflareZoneNotFoundError', {
  message: Schema.String,
  zoneName: Schema.String,
}) {}

export class CloudflareRecordNotFoundError extends Schema.TaggedError<CloudflareRecordNotFoundError>()('CloudflareRecordNotFoundError', {
  message: Schema.String,
  recordName: Schema.String,
}) {}

export class AudioStreamNotFoundError extends Schema.TaggedError<AudioStreamNotFoundError>()('AudioStreamNotFoundError', {
  language: Schema.optional(Schema.String),
  mediaTitle: Schema.String,
  message: Schema.String,
}) {}

export class VideoStreamNotFoundError extends Schema.TaggedError<VideoStreamNotFoundError>()('VideoStreamNotFoundError', {
  mediaTitle: Schema.String,
  message: Schema.String,
}) {}

export class NoStreamsKeptError extends Schema.TaggedError<NoStreamsKeptError>()('NoStreamsKeptError', {
  mediaTitle: Schema.String,
  message: Schema.String,
}) {}

export class FileNameInvalidError extends Schema.TaggedError<FileNameInvalidError>()('FileNameInvalidError', {
  mediaTitle: Schema.String,
  message: Schema.String,
}) {}

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>()('FileNotFoundError', {
  mediaTitle: Schema.String,
  message: Schema.String,
}) {}

export class TmdbIdNotFoundError extends Schema.TaggedError<TmdbIdNotFoundError>()('TmdbIdNotFoundError', {
  filePath: Schema.optional(Schema.String),
  mediaTitle: Schema.String,
  message: Schema.String,
}) {}
