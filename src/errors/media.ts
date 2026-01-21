import { BaseError } from './base'

type MediaErrorCode =
  | 'audio_stream_not_found'
  | 'file_name_invalid'
  | 'file_not_found'
  | 'no_streams_kept'
  | 'part_not_found'
  | 'tmdb_id_not_found'
  | 'video_stream_not_found'

export class MediaError extends BaseError {
  readonly code: MediaErrorCode
  readonly context: {
    filePath?: string
    language?: string
    mediaTitle: string
  }

  constructor(code: MediaErrorCode, mediaTitle: string, extra?: { filePath?: string; language?: string }) {
    super()
    this.code = code
    this.context = {
      filePath: extra?.filePath,
      language: extra?.language,
      mediaTitle,
    }
    this.updateMessage()
  }

  format(): string {
    const { filePath, language, mediaTitle } = this.context

    switch (this.code) {
      case 'file_not_found': {
        return `[${mediaTitle}] No file found`
      }
      case 'tmdb_id_not_found': {
        return `[${mediaTitle}] No tmdbId found in path${filePath ? `: ${filePath}` : ''}`
      }
      case 'part_not_found': {
        return `[${mediaTitle}] No part found in Plex metadata`
      }
      case 'audio_stream_not_found': {
        return `(${mediaTitle}) No audio streams found${language ? ` for language ${language}` : ''}`
      }
      case 'video_stream_not_found': {
        return `(${mediaTitle}) No video streams found`
      }
      case 'no_streams_kept': {
        return `(${mediaTitle}) No audio tracks would be kept after processing`
      }
      case 'file_name_invalid': {
        return `(${mediaTitle}) File name not initialized`
      }
    }
  }
}
