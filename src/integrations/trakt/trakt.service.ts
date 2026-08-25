import { type Effect } from 'effect'
import { type HttpClient as EffectHttpClient } from 'effect/unstable/http'

import {
  deviceCodeResponseValidator,
  syncResponseValidator,
  tokenResponseValidator,
  type TraktDeviceCodeResponse,
  type TraktSyncResponse,
  type TraktTokenResponse,
} from '@/integrations/trakt/trakt.validator'
import { type HttpClientError } from '@/shared/types/http_client'
import { httpClient } from '@/shared/utils/http_client'

export interface TraktMoviePayload {
  ids: { tmdb: number }
  watched_at: string
}

export interface TraktShowPayload {
  ids: { tmdb: number }
  seasons: {
    episodes: { number: number; watched_at: string }[]
    number: number
  }[]
}

export interface ITraktClient {
  readonly getDeviceCode: Effect.Effect<TraktDeviceCodeResponse, HttpClientError>
  readonly pollDeviceToken: (deviceCode: string) => Effect.Effect<TraktTokenResponse, HttpClientError>
  readonly refreshToken: (refreshToken: string) => Effect.Effect<TraktTokenResponse, HttpClientError>
  readonly syncWatchedHistory: (
    accessToken: string,
    movies: TraktMoviePayload[],
    shows: TraktShowPayload[]
  ) => Effect.Effect<TraktSyncResponse, HttpClientError>
}

interface TraktClientConfig {
  clientId: string
  clientSecret: string
  transport: EffectHttpClient.HttpClient
}

export class TraktClient implements ITraktClient {
  private readonly client: ReturnType<typeof httpClient>
  private readonly clientId: string
  private readonly clientSecret: string

  constructor(config: TraktClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.client = httpClient({
      baseUrl: 'https://api.trakt.tv',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Autoscan/1.0',
        'trakt-api-key': this.clientId,
        'trakt-api-version': '2',
      },
      serviceName: 'Trakt',
      transport: config.transport,
    })
  }

  get getDeviceCode() {
    return this.client.post('oauth/device/code', {
      body: { client_id: this.clientId },
      validator: deviceCodeResponseValidator,
    })
  }

  pollDeviceToken(deviceCode: string) {
    return this.client.post('oauth/device/token', {
      body: { client_id: this.clientId, client_secret: this.clientSecret, code: deviceCode },
      validator: tokenResponseValidator,
    })
  }

  refreshToken(refreshToken: string) {
    return this.client.post('oauth/token', {
      body: { client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken },
      validator: tokenResponseValidator,
    })
  }

  syncWatchedHistory(accessToken: string, movies: TraktMoviePayload[], shows: TraktShowPayload[]) {
    return this.client.post('sync/history', {
      body: { movies, shows },
      headers: { Authorization: `Bearer ${accessToken}` },
      validator: syncResponseValidator,
    })
  }
}
