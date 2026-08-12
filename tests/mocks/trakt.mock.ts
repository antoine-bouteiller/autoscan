import { jest } from 'bun:test'

import { Clock, Effect } from 'effect'

import { type ITraktClient, type TraktMoviePayload, type TraktShowPayload } from '@/integrations/trakt/trakt.service'
import { type TraktDeviceCodeResponse, type TraktSyncResponse, type TraktTokenResponse } from '@/integrations/trakt/trakt.validator'
import { NetworkError } from '@/shared/errors/network'

export const getDeviceCodeMock = jest.fn<() => Promise<TraktDeviceCodeResponse>>().mockResolvedValue({
  device_code: 'device',
  expires_in: 600,
  interval: 5,
  user_code: 'code',
  verification_url: 'https://example.com',
})
export const refreshTokenMock = jest.fn<(refreshToken: string) => Promise<TraktTokenResponse>>().mockResolvedValue({
  access_token: 'access',
  created_at: 0,
  expires_in: 3600,
  refresh_token: 'refresh',
  scope: 'scope',
  token_type: 'bearer',
})
export const syncWatchedHistoryMock = jest
  .fn<(accessToken: string, movies: TraktMoviePayload[], shows: TraktShowPayload[]) => Promise<TraktSyncResponse>>()
  .mockResolvedValue({
    added: { episodes: 1, movies: 1 },
    not_found: { episodes: [], movies: [], seasons: [], shows: [] },
  })

const fromPromise = <Value>(run: () => Promise<Value>) =>
  Effect.tryPromise({ catch: (cause) => new NetworkError({ cause, originalMessage: String(cause), serviceName: 'TraktTest' }), try: run })

export class MockTraktClient implements ITraktClient {
  get getDeviceCode() {
    return fromPromise(() => getDeviceCodeMock())
  }

  pollDeviceToken() {
    return Clock.currentTimeMillis.pipe(
      Effect.map((now) => ({
        access_token: 'access_token',
        created_at: now,
        expires_in: 3600,
        refresh_token: 'refresh_token',
        scope: 'scope',
        token_type: 'token_type',
      }))
    )
  }

  refreshToken(refreshToken: string) {
    return fromPromise(() => refreshTokenMock(refreshToken))
  }

  syncWatchedHistory(accessToken: string, movies: TraktMoviePayload[], shows: TraktShowPayload[]) {
    return fromPromise(() => syncWatchedHistoryMock(accessToken, movies, shows))
  }
}
