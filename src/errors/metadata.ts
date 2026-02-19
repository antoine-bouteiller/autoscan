import { AppError } from '@/errors/base'

export class FileNotFoundError extends AppError {
  constructor(mediaTitle: string) {
    super(`[${mediaTitle}] No file found`)
  }
}

export class TmdbIdNotFoundError extends AppError {
  constructor(mediaTitle: string, filePath?: string) {
    const formattedFilePath = filePath ? `: ${filePath}` : ''
    super(`[${mediaTitle}] No tmdbId found in path${formattedFilePath}`)
  }
}
