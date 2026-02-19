import { AppError } from '@/errors/base'

export class AudioStreamNotFoundError extends AppError {
  constructor(mediaTitle: string, language?: string) {
    const formattedLanguage = language ? ` for language ${language}` : ''
    super(`(${mediaTitle}) No audio streams found${formattedLanguage}`)
  }
}

export class VideoStreamNotFoundError extends AppError {
  constructor(mediaTitle: string) {
    super(`(${mediaTitle}) No video streams found`)
  }
}

export class NoStreamsKeptError extends AppError {
  constructor(mediaTitle: string) {
    super(`(${mediaTitle}) No audio tracks would be kept after processing`)
  }
}

export class FileNameInvalidError extends AppError {
  constructor(mediaTitle: string) {
    super(`(${mediaTitle}) File name not initialized`)
  }
}
