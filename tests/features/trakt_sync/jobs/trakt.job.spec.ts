import { beforeEach, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { runTest } from '@tests/effect'
import { MockTraktClient, syncWatchedHistoryMock } from '@tests/utils'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { traktSyncJob } from '@/features/trakt_sync/jobs/trakt.job'

beforeEach(async () => {
  await db.delete(traktSyncHistory)
  await db.delete(traktTokens)
  syncWatchedHistoryMock.mockClear()
})

test('Trakt job tolerates a missing token', async () => {
  expect(await runTest(traktSyncJob)).toBeUndefined()
})

test('Trakt job syncs with a valid token', async () => {
  await db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(Date.now() / 1000) + 3600, refreshToken: 'refresh' })
  await runTest(traktSyncJob, { trakt: new MockTraktClient() })
  expect(syncWatchedHistoryMock).toHaveBeenCalled()
})
