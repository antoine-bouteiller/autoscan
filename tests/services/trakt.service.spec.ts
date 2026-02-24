import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/config/db'
import { traktSyncHistory, traktTokens } from '@/database/schema'
import { TraktTokenExpiredError } from '@/errors/trakt'
import { syncPlexToTrakt } from '@/services/trakt.service'

import { refreshTokenMock, syncWatchedHistoryMock } from '../mocks/trakt.mock'

describe('TraktService', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(traktTokens)
    await db.delete(traktSyncHistory)
  })

  describe('getValidAccessToken', () => {
    it('should return TraktTokenExpiredError if no tokens found', async () => {
      const result = await syncPlexToTrakt()
      expect(result).toBeInstanceOf(TraktTokenExpiredError)
    })

    it('should refresh token if expired', async () => {
      await db.insert(traktTokens).values({
        accessToken: 'old-access',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 100,
      })

      refreshTokenMock.mockResolvedValue({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      })

      await syncPlexToTrakt()

      expect(refreshTokenMock).toHaveBeenCalledWith('refresh')

      const tokens = await db.select().from(traktTokens)
      expect(tokens[0]?.accessToken).toBe('new-access')
      expect(tokens[0]?.refreshToken).toBe('new-refresh')
    })
  })

  describe('syncPlexToTrakt', () => {
    it('should collect and sync watched items', async () => {
      await db.insert(traktTokens).values({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })

      await db.insert(traktSyncHistory).values({
        plexRatingKey: 'already-synced',
        syncedAt: new Date(),
      })

      await syncPlexToTrakt()

      expect(syncWatchedHistoryMock).toHaveBeenCalledWith(
        'access',
        [{ ids: { tmdb: 123 }, watched_at: new Date(1_700_000_000 * 1000).toISOString() }],
        [{ ids: { tmdb: 999 }, seasons: [{ number: 1, episodes: [{ number: 5, watched_at: new Date(1_700_000_001 * 1000).toISOString() }] }] }]
      )

      const syncedHistory = await db.select().from(traktSyncHistory)
      const syncedKeys = syncedHistory.map((media) => media.plexRatingKey)
      expect(syncedKeys).toContain('movie-1')
      expect(syncedKeys).toContain('ep-1')
      expect(syncedKeys).toContain('already-synced')
    })
  })
})
