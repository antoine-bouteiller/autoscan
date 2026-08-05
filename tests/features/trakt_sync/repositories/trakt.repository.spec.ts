import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { getSyncedRatingKeys, getToken, markManyAsSynced, upsertTokens } from '@/features/trakt_sync/repositories/trakt.repository'

describe('trakt repository', () => {
  beforeEach(async () => {
    await db.delete(traktSyncHistory)
    await db.delete(traktTokens)
  })

  test('upserts tokens', async () => {
    expect(await runTest(getToken)).toBeUndefined()
    await runTest(upsertTokens('first', 'refresh-1', 1))
    await runTest(upsertTokens('second', 'refresh-2', 2))
    expect(await runTest(getToken)).toMatchObject({ accessToken: 'second', expiresAt: 2, refreshToken: 'refresh-2' })
    expect(await db.select().from(traktTokens)).toHaveLength(1)
  })

  test('stores unique synced rating keys', async () => {
    await runTest(markManyAsSynced(['one', 'two', 'one']))
    expect(await runTest(getSyncedRatingKeys)).toEqual(new Set(['one', 'two']))
  })

  test('accepts an empty synced-key list', async () => {
    await runTest(markManyAsSynced([]))
    expect(await db.select().from(traktSyncHistory)).toHaveLength(0)
  })
})
