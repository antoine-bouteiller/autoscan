import { type TwoLetterLanguageCode } from '@/shared/types/iso_codes'

export interface TranscodeJob {
  command: string[]
  duration?: number
  file: string
  mediaTitle: string
  mediaType: 'movie' | 'show'
  originalLanguage: TwoLetterLanguageCode
  subtitlesToExtract: { index: number; language: TwoLetterLanguageCode }[]
}
