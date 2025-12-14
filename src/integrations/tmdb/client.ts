import type { MediaType } from '@/integrations/plex'

import env from '@/config/env'
import { handleHttpError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import {
  tmdbTvResponse,
  type TmdbMedia,
  type TmdbMovie,
  tmdbMovieResponse,
  type TmdbTV,
} from './validators'

const tmdbClient = httpClient({
  baseUrl: env.TMDB_API_URL,
  headers: {
    Authorization: `Bearer ${env.TMDB_API_TOKEN}`,
  },
})

export const getTmdbMedia = async (tmdbId: number, mediaType: MediaType): Promise<TmdbMedia> => {
  if (mediaType === 'movie') {
    const data = await getTmdbMovie(tmdbId)

    return { type: 'movie', data }
  }

  const data = await getTmdbTvShow(tmdbId)

  return {
    type: 'tv',
    data,
  }
}

export const getTmdbTvShow = async (tmdbId: number): Promise<TmdbTV | undefined> => {
  const result = await tmdbClient.get(`tv/${tmdbId}`, {
    validator: tmdbTvResponse,
  })

  if (!result.ok) {
    handleHttpError(result.error, 'TMDB')
    return undefined
  }

  return result.data
}

export const getTmdbMovie = async (tmdbId: number): Promise<TmdbMovie | undefined> => {
  const result = await tmdbClient.get(`movie/${tmdbId}`, {
    validator: tmdbMovieResponse,
  })

  if (!result.ok) {
    handleHttpError(result.error, 'TMDB')
    return undefined
  }

  return result.data
}
