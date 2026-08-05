import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'
import { MockPlexClient, MockTraktClient, refreshTokenMock, syncWatchedHistoryMock } from '@tests/utils'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { TraktTokenExpiredError } from '@/features/trakt_sync/errors'
import { collectWatchedItems, getValidAccessToken, syncPlexToTrakt } from '@/features/trakt_sync/services/plextraktsync.service'

describe('Trakt sync service', () => {
  beforeEach(async () => {
    await db.delete(traktSyncHistory)
    await db.delete(traktTokens)
    refreshTokenMock.mockClear()
    syncWatchedHistoryMock.mockClear()
  })

  test('fails when no token exists', async () => {
    expect(await runTest(getValidAccessToken).catch((error) => error)).toBeInstanceOf(TraktTokenExpiredError)
  })

  test('returns a valid token', async () => {
    await db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: 'refresh' })
    expect(await runTest(getValidAccessToken)).toBe('valid')
  })

  test('refreshes an expired token', async () => {
    await db.insert(traktTokens).values({ accessToken: 'old', expiresAt: 0, refreshToken: 'refresh' })
    expect(await runTest(getValidAccessToken, { trakt: new MockTraktClient() })).toBe('access')
    expect(refreshTokenMock).toHaveBeenCalledWith('refresh')
  })

  test('collects watched movies and episodes', async () => {
    const result = await runTest(collectWatchedItems(new MockPlexClient(), new Set(['already-synced'])))
    expect(result.movies).toHaveLength(1)
    expect(result.shows).toHaveLength(1)
    expect(result.ratingKeysToMark).toEqual(['movie-1', 'ep-1'])
  })

  test('syncs and persists history', async () => {
    await db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: 'refresh' })
    expect(await runTest(syncPlexToTrakt, { plex: new MockPlexClient(), trakt: new MockTraktClient() })).toEqual({ episodes: 1, movies: 1 })
    expect(syncWatchedHistoryMock).toHaveBeenCalled()
    expect(await db.select().from(traktSyncHistory)).toHaveLength(3)
  })
})
