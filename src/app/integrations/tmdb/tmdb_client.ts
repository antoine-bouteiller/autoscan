import ky from 'ky'

import type { MediaType } from '@/types/plex'
import type { TmdbResponse } from '@/types/tmdb'

import env from '@/config/env'

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
