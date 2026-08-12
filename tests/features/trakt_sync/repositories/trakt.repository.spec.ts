import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { traktSyncHistory, traktTokens } from '@/database/schema'
import { getSyncedRatingKeys, getToken, markManyAsSynced, upsertTokens } from '@/features/trakt_sync/repositories/trakt.repository'

describe('trakt repository', () => {
  beforeEach(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.promise(() => db.delete(traktSyncHistory))
        yield* Effect.promise(() => db.delete(traktTokens))
      })
    )
  )

  it.live('upserts tokens', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(getToken)).toBeUndefined()
      yield* provideTest(upsertTokens('first', 'refresh-1', 1))
      yield* provideTest(upsertTokens('second', 'refresh-2', 2))
      expect(yield* provideTest(getToken)).toMatchObject({ accessToken: 'second', expiresAt: 2, refreshToken: 'refresh-2' })
      expect(yield* Effect.promise(() => db.select().from(traktTokens))).toHaveLength(1)
    })
  )

  it.live('stores unique synced rating keys', () =>
    Effect.gen(function* () {
      yield* provideTest(markManyAsSynced(['one', 'two', 'one']))
      expect(yield* provideTest(getSyncedRatingKeys)).toEqual(new Set(['one', 'two']))
    })
  )

  it.live('accepts an empty synced-key list', () =>
    Effect.gen(function* () {
      yield* provideTest(markManyAsSynced([]))
      expect(yield* Effect.promise(() => db.select().from(traktSyncHistory))).toHaveLength(0)
    })
  )
})
