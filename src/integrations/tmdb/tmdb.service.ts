import { Effect } from 'effect'
import { type HttpClient as EffectHttpClient } from 'effect/unstable/http'

import { type MediaType } from '@/integrations/plex/plex.service'
import { tmdbMovieResponse, tmdbTvResponse, type TmdbMedia, type TmdbMovie, type TmdbTV } from '@/integrations/tmdb/tmdb.validator'
import { type HttpClientError } from '@/shared/types/http_client'
import { httpClient } from '@/shared/utils/http_client'

export interface ITmdbClient {
  readonly getTmdbMedia: (tmdbId: number, mediaType: MediaType) => Effect.Effect<TmdbMedia, HttpClientError>
  readonly getTmdbMovie: (tmdbId: number) => Effect.Effect<TmdbMovie, HttpClientError>
  readonly getTmdbTvShow: (tmdbId: number) => Effect.Effect<TmdbTV, HttpClientError>
}

interface TmdbClientConfig {
  apiToken: string
  apiUrl: string
  transport: EffectHttpClient.HttpClient
}

export class TmdbClient implements ITmdbClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor(config: TmdbClientConfig) {
    this.client = httpClient({
      baseUrl: config.apiUrl,
      headers: { Authorization: `Bearer ${config.apiToken}` },
      serviceName: 'TMDB',
      transport: config.transport,
    })
  }

  getTmdbMedia(tmdbId: number, mediaType: MediaType) {
    return mediaType === 'movie'
      ? this.getTmdbMovie(tmdbId).pipe(Effect.map((data) => ({ data, type: 'movie' as const })))
      : this.getTmdbTvShow(tmdbId).pipe(Effect.map((data) => ({ data, type: 'tv' as const })))
  }

  getTmdbTvShow(tmdbId: number) {
    return this.client.get(`tv/${tmdbId}`, { validator: tmdbTvResponse })
  }

  getTmdbMovie(tmdbId: number) {
    return this.client.get(`movie/${tmdbId}`, { validator: tmdbMovieResponse })
  }
}
