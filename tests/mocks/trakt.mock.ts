import { vi } from 'vite-plus/test'

import type { ITraktClient, TraktMoviePayload, TraktShowPayload } from '#integrations/trakt.service'

const getDeviceCodeMock = vi.fn()
const pollDeviceTokenMock = vi.fn()
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
  async getDeviceCode() {
    return getDeviceCodeMock()
  }

  async pollDeviceToken(deviceCode: string) {
    return pollDeviceTokenMock(deviceCode)
  }

  async refreshToken(refreshToken: string) {
    return refreshTokenMock(refreshToken)
  }

  async syncWatchedHistory(accessToken: string, movies: TraktMoviePayload[], shows: TraktShowPayload[]) {
    return syncWatchedHistoryMock(accessToken, movies, shows)
  }
}
