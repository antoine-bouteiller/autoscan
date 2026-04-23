import { vi } from 'vite-plus/test'

import { type ITraktClient, type TraktMoviePayload, type TraktShowPayload } from '#/integrations/trakt/trakt.service'

export const getDeviceCodeMock = vi.fn()
export const refreshTokenMock = vi.fn()
export const syncWatchedHistoryMock = vi.fn<ITraktClient['syncWatchedHistory']>().mockResolvedValue({
  added: { episodes: 1, movies: 1 },
  not_found: {
    episodes: [],
    movies: [],
    seasons: [],
    shows: [],
  },
})

export class MockTraktClient implements ITraktClient {
  getDeviceCode = getDeviceCodeMock

  async pollDeviceToken() {
    return {
      access_token: 'access_token',
      created_at: new Date().getTime(),
      expires_in: new Date().getTime() + 3_600_000,
      refresh_token: 'refresh_token',
      scope: 'scope',
      token_type: 'token_type',
    }
  }

  refreshToken = refreshTokenMock

  async syncWatchedHistory(accessToken: string, movies: TraktMoviePayload[], shows: TraktShowPayload[]) {
    return syncWatchedHistoryMock(accessToken, movies, shows)
  }
}
