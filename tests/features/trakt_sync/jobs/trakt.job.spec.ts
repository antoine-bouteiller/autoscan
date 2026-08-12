import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { expect, it } from '@tests/it'
import { MockTraktClient, syncWatchedHistoryMock } from '@tests/utils'
import { Clock, Effect } from 'effect'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { traktSyncJob } from '@/features/trakt_sync/jobs/trakt.job'

beforeEach(() =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.promise(() => db.delete(traktSyncHistory))
      yield* Effect.promise(() => db.delete(traktTokens))
      syncWatchedHistoryMock.mockClear()
    })
  )
)

it.live('Trakt job tolerates a missing token', () =>
  Effect.gen(function* () {
    expect(yield* provideTest(traktSyncJob)).toBeUndefined()
  })
)

it.live('Trakt job syncs with a valid token', () =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    yield* Effect.promise(() =>
      db.insert(traktTokens).values({ accessToken: 'valid', expiresAt: Math.floor(now / 1000) + 3600, refreshToken: 'refresh' })
    )
    yield* provideTest(traktSyncJob, { trakt: new MockTraktClient() })
    expect(syncWatchedHistoryMock).toHaveBeenCalled()
  })
)
