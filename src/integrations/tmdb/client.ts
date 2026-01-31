import type { MediaType } from '@/integrations/plex/client'

import env from '@/config/env'
import { logError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import { type TmdbMedia, type TmdbMovie, tmdbMovieResponse, type TmdbTV, tmdbTvResponse } from './validators'

const tmdbClient = httpClient({
  baseUrl: env.TMDB_API_URL,
  headers: {
    Authorization: `Bearer ${env.TMDB_API_TOKEN}`,
  },
  serviceName: 'TMDB',
})

export const getTmdbMedia = async (tmdbId: number, mediaType: MediaType): Promise<TmdbMedia> => {
  if (mediaType === 'movie') {
    const data = await getTmdbMovie(tmdbId)

    return { data, type: 'movie' }
  }

  const data = await getTmdbTvShow(tmdbId)

  return {
    data,
    type: 'tv',
  }
}

export const getTmdbTvShow = async (tmdbId: number): Promise<TmdbTV | undefined> => {
  const result = await tmdbClient.get(`tv/${tmdbId}`, {
    validator: tmdbTvResponse,
  })

  if (!result.ok) {
    logError(result.error)
    return undefined
  }

  return result.data
}

export const getTmdbMovie = async (tmdbId: number): Promise<TmdbMovie | undefined> => {
  const result = await tmdbClient.get(`movie/${tmdbId}`, {
    validator: tmdbMovieResponse,
  })

  if (!result.ok) {
    logError(result.error)
    return undefined
  }

  return result.data
}
