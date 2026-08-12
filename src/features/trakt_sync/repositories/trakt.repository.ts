import { eq } from 'drizzle-orm'
import { DateTime, Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { traktSyncHistory, traktTokens } from '@/database/schema'

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const getToken = Database.use(({ db }) => query(() => db.select().from(traktTokens).limit(1)).pipe(Effect.map((rows) => rows[0])))

export const upsertTokens = (accessToken: string, refreshToken: string, expiresAt: number) =>
  Database.use(({ db }) =>
    Effect.gen(function* () {
      const [existing] = yield* query(() => db.select().from(traktTokens).limit(1))
      yield* query(() =>
        existing === undefined
          ? db.insert(traktTokens).values({ accessToken, expiresAt, refreshToken })
          : db.update(traktTokens).set({ accessToken, expiresAt, refreshToken }).where(eq(traktTokens.id, existing.id))
      )
    })
  )

export const getSyncedRatingKeys = Database.use(({ db }) =>
  query(() => db.select({ plexRatingKey: traktSyncHistory.plexRatingKey }).from(traktSyncHistory)).pipe(
    Effect.map((rows) => new Set(rows.map((row) => row.plexRatingKey)))
  )
)

export const markManyAsSynced = (ratingKeys: string[]) => {
  if (ratingKeys.length === 0) {
    return Effect.void
  }

  return Effect.gen(function* () {
    const syncedAt = yield* DateTime.nowAsDate
    const rows = [...new Set(ratingKeys)].map((plexRatingKey) => ({ plexRatingKey, syncedAt }))
    yield* Database.use(({ db }) => query(() => db.insert(traktSyncHistory).values(rows).onConflictDoNothing()))
  })
}
