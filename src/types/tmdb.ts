import type { ISOCode1 } from '@/types/iso_codes'

export interface TmdbResponse {
  languages: string[]
  name: string
  original_language: ISOCode1
  title: string
}
