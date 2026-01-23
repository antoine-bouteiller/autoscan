import { AppError } from '@/errors'

export class AudioStreamNotFoundError extends AppError {
  constructor(
    public readonly mediaTitle: string,
    public readonly language?: string
  ) {
    const formattedLanguage = language ? ` for language ${language}` : ''
    super(`(${mediaTitle}) No audio streams found${formattedLanguage}`)
  }
}

export class VideoStreamNotFoundError extends AppError {
  constructor(public readonly mediaTitle: string) {
    super(`(${mediaTitle}) No video streams found`)
  }
}

export class NoStreamsKeptError extends AppError {
  constructor(public readonly mediaTitle: string) {
    super(`(${mediaTitle}) No audio tracks would be kept after processing`)
  }
}

export class FileNameInvalidError extends AppError {
  constructor(public readonly mediaTitle: string) {
    super(`(${mediaTitle}) File name not initialized`)
  }
}
