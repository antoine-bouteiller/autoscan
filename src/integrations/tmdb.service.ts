import type { MediaType } from '@/integrations/plex.service'
import { httpClient } from '@/utils/http_client'
import { type TmdbMedia, type TmdbMovie, tmdbMovieResponse, type TmdbTV, tmdbTvResponse } from '@/validators/tmdb.validator'

import { isError, logError } from '../utils/error'

export interface ITmdbClient {
  getTmdbMedia(tmdbId: number, mediaType: MediaType): Promise<TmdbMedia>
  getTmdbTvShow(tmdbId: number): Promise<TmdbTV | undefined>
  getTmdbMovie(tmdbId: number): Promise<TmdbMovie | undefined>
}

interface TmdbClientConfig {
  apiToken: string
  apiUrl: string
}

export class TmdbClient implements ITmdbClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor(config: TmdbClientConfig) {
    this.client = httpClient({
      baseUrl: config.apiUrl,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
      serviceName: 'TMDB',
    })
  }

  async getTmdbMedia(tmdbId: number, mediaType: MediaType): Promise<TmdbMedia> {
    if (mediaType === 'movie') {
      const data = await this.getTmdbMovie(tmdbId)

      return { data, type: 'movie' }
    }

    const data = await this.getTmdbTvShow(tmdbId)

    return {
      data,
      type: 'tv',
    }
  }

  async getTmdbTvShow(tmdbId: number): Promise<TmdbTV | undefined> {
    const result = await this.client.get(`tv/${tmdbId}`, {
      validator: tmdbTvResponse,
    })

    if (isError(result)) {
      logError(result)
      return undefined
    }

    return result
  }

  async getTmdbMovie(tmdbId: number): Promise<TmdbMovie | undefined> {
    const result = await this.client.get(`movie/${tmdbId}`, {
      validator: tmdbMovieResponse,
    })

    if (isError(result)) {
      logError(result)
      return undefined
    }

    return result
  }
}
