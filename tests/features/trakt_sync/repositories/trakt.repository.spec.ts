import { beforeEach, describe, expect, test } from 'vite-plus/test'

import { db } from '#/config/db'
import { traktSyncHistory, traktTokens } from '#/database/schema'
import { getSyncedRatingKeys, getToken, markManyAsSynced, upsertTokens } from '#/features/trakt_sync/repositories/trakt.repository'

import '../../../utils.ts'

describe('trakt.repository', () => {
  beforeEach(async () => {
    await db.delete(traktTokens)
    await db.delete(traktSyncHistory)
  })

  describe('getToken', () => {
    test('should return undefined when no token exists', async () => {
      const token = await getToken()
      expect(token).toBeUndefined()
    })

    test('should return inserted token', async () => {
      await db.insert(traktTokens).values({ accessToken: 'a', expiresAt: 100, refreshToken: 'r' })
      const token = await getToken()
      expect(token?.accessToken).toBe('a')
      expect(token?.refreshToken).toBe('r')
      expect(token?.expiresAt).toBe(100)
    })
  })

  describe('upsertTokens', () => {
    test('should insert new row when none exists', async () => {
      await upsertTokens('access', 'refresh', 1000)
      const rows = await db.select().from(traktTokens)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.accessToken).toBe('access')
    })

    test('should update existing row instead of inserting', async () => {
      await upsertTokens('access1', 'refresh1', 1000)
      await upsertTokens('access2', 'refresh2', 2000)
      const rows = await db.select().from(traktTokens)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.accessToken).toBe('access2')
      expect(rows[0]?.refreshToken).toBe('refresh2')
      expect(rows[0]?.expiresAt).toBe(2000)
    })
  })

  describe('getSyncedRatingKeys', () => {
    test('should return empty set when history is empty', async () => {
      const keys = await getSyncedRatingKeys()
      expect(keys.size).toBe(0)
    })

    test('should return set of synced rating keys', async () => {
      await db.insert(traktSyncHistory).values([
        { plexRatingKey: 'k1', syncedAt: new Date() },
        { plexRatingKey: 'k2', syncedAt: new Date() },
      ])
      const keys = await getSyncedRatingKeys()
      expect(keys.has('k1')).toBe(true)
      expect(keys.has('k2')).toBe(true)
      expect(keys.size).toBe(2)
    })
  })

  describe('markManyAsSynced', () => {
    test('should do nothing for empty array', async () => {
      await markManyAsSynced([])
      const rows = await db.select().from(traktSyncHistory)
      expect(rows).toHaveLength(0)
    })

    test('should insert rating keys', async () => {
      await markManyAsSynced(['k1', 'k2'])
      const rows = await db.select().from(traktSyncHistory)
      expect(rows).toHaveLength(2)
    })

    test('should ignore conflicts on duplicate rating keys', async () => {
      await markManyAsSynced(['k1'])
      await markManyAsSynced(['k1', 'k2'])
      const rows = await db.select().from(traktSyncHistory)
      expect(rows).toHaveLength(2)
    })
  })
})
