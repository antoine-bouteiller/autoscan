import { AppError } from '@/errors/base'

export class FileNotFoundError extends AppError {
  constructor(public readonly mediaTitle: string) {
    super(`[${mediaTitle}] No file found`)
  }
}

export class TmdbIdNotFoundError extends AppError {
  constructor(
    public readonly mediaTitle: string,
    public readonly filePath?: string
  ) {
    const formattedFilePath = filePath ? `: ${filePath}` : ''
    super(`[${mediaTitle}] No tmdbId found in path${formattedFilePath}`)
  }
}
