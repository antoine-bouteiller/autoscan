import type { HttpError } from '#errors/http'
import type { NetworkError } from '#errors/network'
import type { ValidationError } from '#errors/validation'
import { httpClient } from '#utils/http_client'
import {
  type TraktDeviceCodeResponse,
  type TraktSyncResponse,
  type TraktTokenResponse,
  deviceCodeResponseValidator,
  syncResponseValidator,
  tokenResponseValidator,
} from '#validators/trakt.validator'

export interface TraktMoviePayload {
  ids: { tmdb: number }
  watched_at: string
}

export interface TraktShowPayload {
  ids: { tmdb: number }
  seasons: {
    episodes: {
      number: number
      watched_at: string
    }[]
    number: number
  }[]
}

export interface ITraktClient {
  getDeviceCode(): Promise<TraktDeviceCodeResponse | HttpError | NetworkError | ValidationError>
  pollDeviceToken(deviceCode: string): Promise<TraktTokenResponse | HttpError | NetworkError | ValidationError>
  refreshToken(refreshToken: string): Promise<TraktTokenResponse | HttpError | NetworkError | ValidationError>
  syncWatchedHistory(
    accessToken: string,
    movies: TraktMoviePayload[],
    shows: TraktShowPayload[]
  ): Promise<TraktSyncResponse | HttpError | NetworkError | ValidationError>
}

interface TraktClientConfig {
  clientId: string
  clientSecret: string
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
        'trakt-api-key': this.clientId,
        'trakt-api-version': '2',
      },
      serviceName: 'Trakt',
    })
  }

  async getDeviceCode() {
    return this.client.post('oauth/device/code', {
      body: { client_id: this.clientId },
      validator: deviceCodeResponseValidator,
    })
  }

  async pollDeviceToken(deviceCode: string) {
    return this.client.post('oauth/device/token', {
      body: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: deviceCode,
      },
      validator: tokenResponseValidator,
    })
  }

  async refreshToken(refreshToken: string) {
    return this.client.post('oauth/token', {
      body: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      validator: tokenResponseValidator,
    })
  }

  async syncWatchedHistory(accessToken: string, movies: TraktMoviePayload[], shows: TraktShowPayload[]) {
    return this.client.post('sync/history', {
      body: {
        movies,
        shows,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      validator: syncResponseValidator,
    })
  }
}
