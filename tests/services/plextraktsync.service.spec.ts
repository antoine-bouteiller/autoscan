import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { db } from '#config/db'
import { container, TOKENS } from '#core/container'
import { traktSyncHistory, traktTokens } from '#database/schema'
import { TraktTokenExpiredError } from '#errors/trakt'
import type { IPlexClient } from '#integrations/plex.service'
import { collectWatchedItems, getValidAccessToken, syncPlexToTrakt } from '#services/plextraktsync.service'

import { refreshTokenMock, syncWatchedHistoryMock } from '../mocks/trakt.mock.js'

describe('TraktService', () => {
  const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete(traktTokens)
    await db.delete(traktSyncHistory)
  })

  describe('getValidAccessToken', () => {
    it('should return TraktTokenExpiredError if no tokens found', async () => {
      const result = await getValidAccessToken()
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

      const result = await getValidAccessToken()

      expect(refreshTokenMock).toHaveBeenCalledWith('refresh')
      expect(result).toBe('new-access')

      const tokens = await db.select().from(traktTokens)
      expect(tokens[0]?.accessToken).toBe('new-access')
    })

    it('should return current token if not expired', async () => {
      await db.insert(traktTokens).values({
        accessToken: 'valid-access',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })

      const result = await getValidAccessToken()
      expect(result).toBe('valid-access')
      expect(refreshTokenMock).not.toHaveBeenCalled()
    })
  })

  describe('collectWatchedItems', () => {
    it('should collect movies and episodes correctly from MockPlexClient', async () => {
      const result = await collectWatchedItems(plexClient, new Set(['already-synced']))

      expect(result.movies).toHaveLength(1)
      expect(result.movies[0]?.ids.tmdb).toBe(123)
      expect(result.shows).toHaveLength(1)
      expect(result.shows[0]?.ids.tmdb).toBe(999)
      expect(result.ratingKeysToMark).toEqual(['movie-1', 'ep-1'])
    })

    it('should exclude already synced items', async () => {
      const result = await collectWatchedItems(plexClient, new Set(['movie-1', 'already-synced', 'ep-1']))
      expect(result.movies).toHaveLength(0)
      expect(result.shows).toHaveLength(0)
      expect(result.ratingKeysToMark).toHaveLength(0)
    })
  })

  describe('syncPlexToTrakt', () => {
    it('should orchestrate the full sync process', async () => {
      await db.insert(traktTokens).values({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })

      const result = await syncPlexToTrakt()

      expect(syncWatchedHistoryMock).toHaveBeenCalled()
      expect(result).toEqual({ movies: 1, episodes: 1 })

      const history = await db.select().from(traktSyncHistory)
      const ratingKeys = history.map((row) => row.plexRatingKey)
      expect(ratingKeys).toContain('movie-1')
      expect(ratingKeys).toContain('ep-1')
    })

    it('should return 0 counts if nothing to sync', async () => {
      await db.insert(traktTokens).values({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      })

      vi.spyOn(plexClient, 'getSections').mockResolvedValue([])

      const result = await syncPlexToTrakt()
      expect(result).toEqual({ episodes: 0, movies: 0 })
      expect(syncWatchedHistoryMock).not.toHaveBeenCalled()
    })
  })
})
