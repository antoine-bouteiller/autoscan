import type { ISOCode1 } from '#types/iso_codes'

export interface TranscodeJob {
  command: string[]
  duration?: number
  file: string
  id: number
  mediaTitle: string
  mediaType: 'movie' | 'show'
  originalLanguage: ISOCode1
  subtitlesToExtract: { index: number; language: ISOCode1 }[]
}
