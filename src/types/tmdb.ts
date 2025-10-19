import type { iso1 } from '@/types/iso_codes'

export interface TmdbResponse {
  name: string
  languages: string[]
  original_language: iso1
  title: string
}
