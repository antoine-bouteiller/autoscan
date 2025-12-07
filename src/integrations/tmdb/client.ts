import type { MediaType } from '@/integrations/plex'

import env from '@/config/env'
import { handleHttpError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import { type TmdbResponse, tmdbResponseValidator } from './validators'

const tmdbClient = httpClient({
  baseUrl: env.TMDB_API_URL,
  headers: {
    Authorization: `Bearer ${env.TMDB_API_TOKEN}`,
  },
})

export const getTmdbMedia = async (
  tmdbId: number,
  mediaType: MediaType
): Promise<TmdbResponse | undefined> => {
  const endpoint = mediaType === 'movie' ? `movie/${tmdbId}` : `tv/${tmdbId}`
  const result = await tmdbClient.get(endpoint, {
    validator: tmdbResponseValidator,
  })

  if (!result.ok) {
    handleHttpError(result.error, 'TMDB')
    return undefined
  }

  return result.data
}
