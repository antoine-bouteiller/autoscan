import { createTaggedError } from '../utils/error'

export class AudioStreamNotFoundError extends createTaggedError({
  name: 'AudioStreamNotFoundError',
  message: '($mediaTitle) No audio streams found for language $language',
}) {}

export class VideoStreamNotFoundError extends createTaggedError({
  name: 'VideoStreamNotFoundError',
  message: '($mediaTitle) No video streams found',
}) {}

export class NoStreamsKeptError extends createTaggedError({
  name: 'NoStreamsKeptError',
  message: '($mediaTitle) No audio tracks would be kept after processing',
}) {}

export class FileNameInvalidError extends createTaggedError({
  name: 'FileNameInvalidError',
  message: '($mediaTitle) File name not initialized',
}) {}
