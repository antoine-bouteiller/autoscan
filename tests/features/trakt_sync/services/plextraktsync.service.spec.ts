import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockPlexClient, MockTraktClient, refreshTokenMock, syncWatchedHistoryMock } from '@tests/utils'
import { Clock, Effect } from 'effect'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { TraktTokenExpiredError } from '@/features/trakt_sync/errors'
import { collectWatchedItems, getValidAccessToken, syncPlexToTrakt } from '@/features/trakt_sync/services/plextraktsync.service'

describe('Trakt sync service', () => {
  beforeEach(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.promise(() => db.delete(traktSyncHistory))
        yield* Effect.promise(() => db.delete(traktTokens))
        refreshTokenMock.mockClear()
        syncWatchedHistoryMock.mockClear()
      })
    )
  )

  it.live('fails when no token exists', () =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(provideTest(getValidAccessToken))).toBeInstanceOf(TraktTokenExpiredError)
    })
  )

  it.live('returns a valid token', () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      yield* Effect.promise(() =>
        db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(now / 1000) + 3600, refreshToken: 'refresh' })
      )
      expect(yield* provideTest(getValidAccessToken)).toBe('valid')
    })
  )

  it.live('refreshes an expired token', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => db.insert(traktTokens).values({ accessToken: 'old', expiresAt: 0, refreshToken: 'refresh' }))
      expect(yield* provideTest(getValidAccessToken, { trakt: new MockTraktClient() })).toBe('access')
      expect(refreshTokenMock).toHaveBeenCalledWith('refresh')
    })
  )

  it.live('collects watched movies and episodes', () =>
    Effect.gen(function* () {
      const result = yield* provideTest(collectWatchedItems(new MockPlexClient(), new Set(['already-synced'])))
      expect(result.movies).toHaveLength(1)
      expect(result.shows).toHaveLength(1)
      expect(result.ratingKeysToMark).toEqual(['movie-1', 'ep-1'])
    })
  )

  it.live('syncs and persists history', () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      yield* Effect.promise(() =>
        db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(now / 1000) + 3600, refreshToken: 'refresh' })
      )
      expect(yield* provideTest(syncPlexToTrakt, { plex: new MockPlexClient(), trakt: new MockTraktClient() })).toEqual({ episodes: 1, movies: 1 })
      expect(syncWatchedHistoryMock).toHaveBeenCalled()
      expect(yield* Effect.promise(() => db.select().from(traktSyncHistory))).toHaveLength(3)
    })
  )
})
