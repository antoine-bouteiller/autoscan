import type { MediaType } from '@/integrations/plex.service'

import { logError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'
import { type TmdbMedia, type TmdbMovie, tmdbMovieResponse, type TmdbTV, tmdbTvResponse } from '@/validators/tmdb.validator'

interface TmdbClientConfig {
  apiToken: string
  apiUrl: string
}

export class TmdbClient {
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

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    return result.data
  }

  async getTmdbMovie(tmdbId: number): Promise<TmdbMovie | undefined> {
    const result = await this.client.get(`movie/${tmdbId}`, {
      validator: tmdbMovieResponse,
    })

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    return result.data
  }
}
