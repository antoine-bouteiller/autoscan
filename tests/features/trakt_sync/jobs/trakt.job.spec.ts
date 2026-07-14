import { beforeEach, describe, expect, jest, test } from 'bun:test'

import { syncWatchedHistoryMock } from '@tests/mocks/trakt.mock'

import { db } from '@/config/db'
import { traktSyncHistory, traktTokens } from '@/database/schema'
import { traktSyncJob } from '@/features/trakt_sync/jobs/trakt.job'

import '../../../utils.ts'

describe('traktSyncJob', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await db.delete(traktTokens)
    await db.delete(traktSyncHistory)
  })

  test('should run sync without throwing when token missing', async () => {
    await traktSyncJob()
    expect(syncWatchedHistoryMock).not.toHaveBeenCalled()
  })

  test('should call syncWatchedHistory when token is valid and items exist', async () => {
    await db.insert(traktTokens).values({
      accessToken: 'access',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      refreshToken: 'refresh',
    })

    await traktSyncJob()

    expect(syncWatchedHistoryMock).toHaveBeenCalled()
  })
})
