import { createTaggedError } from '#utils/error'

export class AudioStreamNotFoundError extends createTaggedError({
  message: '($mediaTitle) No audio streams found for language $language',
  name: 'AudioStreamNotFoundError',
}) {}

export class VideoStreamNotFoundError extends createTaggedError({
  message: '($mediaTitle) No video streams found',
  name: 'VideoStreamNotFoundError',
}) {}

export class NoStreamsKeptError extends createTaggedError({
  message: '($mediaTitle) No audio tracks would be kept after processing',
  name: 'NoStreamsKeptError',
}) {}

export class FileNameInvalidError extends createTaggedError({
  message: '($mediaTitle) File name not initialized',
  name: 'FileNameInvalidError',
}) {}

export class FileNotFoundError extends createTaggedError({
  message: '($filePath) File not found',
  name: 'FileNotFoundError',
}) {}
