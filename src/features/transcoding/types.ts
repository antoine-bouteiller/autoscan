import { type ISOCode1 } from '@/shared/types/iso_codes'

export interface TranscodeJob {
  command: string[]
  duration?: number
  file: string
  mediaTitle: string
  mediaType: 'movie' | 'show'
  originalLanguage: ISOCode1
  subtitlesToExtract: { index: number; language: ISOCode1 }[]
}
