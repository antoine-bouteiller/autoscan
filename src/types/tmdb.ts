import type { ISOCode1 } from '@/types/iso_codes'

export interface TmdbResponse {
  name: string
  languages: string[]
  original_language: ISOCode1
  title: string
}
