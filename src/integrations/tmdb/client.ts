import ky from 'ky'

import type { MediaType } from '@/integrations/plex/client'
import type { ISOCode1 } from '@/types/iso_codes'

import env from '@/config/env'

// Types
export interface TmdbResponse {
  languages: string[]
  name: string
  original_language: ISOCode1
  title: string
}

const tmdbClient = ky.create({
  headers: {
    Authorization: `Bearer ${env.TMDB_API_TOKEN}`,
  },
  prefixUrl: env.TMDB_API_URL,
  throwHttpErrors: false,
})

export const getTmdbMedia = async (
  tmdbId: number,
  type: MediaType
): Promise<TmdbResponse | undefined> => {
  const endpoint = type === 'movie' ? `movie/${tmdbId}` : `tv/${tmdbId}`
  const response = await tmdbClient<TmdbResponse>(endpoint)

  if (!response.ok) {
    return
  }

  return response.json()
}
