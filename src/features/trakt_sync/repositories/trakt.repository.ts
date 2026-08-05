import { eq } from 'drizzle-orm'
import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { traktSyncHistory, traktTokens } from '@/database/schema'

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const getToken = Database.use(({ db }) =>
  query(async () => {
    const result = await db.select().from(traktTokens).limit(1)
    return result[0]
  })
)

export const upsertTokens = (accessToken: string, refreshToken: string, expiresAt: number) =>
  Database.use(({ db }) =>
    query(async () => {
      const [existing] = await db.select().from(traktTokens).limit(1)
      await (existing === undefined
        ? db.insert(traktTokens).values({ accessToken, expiresAt, refreshToken })
        : db.update(traktTokens).set({ accessToken, expiresAt, refreshToken }).where(eq(traktTokens.id, existing.id)))
    })
  )

export const getSyncedRatingKeys = Database.use(({ db }) =>
  query(async () => {
    const result = await db.select({ plexRatingKey: traktSyncHistory.plexRatingKey }).from(traktSyncHistory)
    return new Set(result.map((row) => row.plexRatingKey))
  })
)

export const markManyAsSynced = (ratingKeys: string[]) => {
  if (ratingKeys.length === 0) {
    return Effect.void
  }

  return Database.use(({ db }) =>
    query(() =>
      db.transaction(async (transaction) => {
        const syncedAt = new Date()
        for (const plexRatingKey of ratingKeys) {
          await transaction.insert(traktSyncHistory).values({ plexRatingKey, syncedAt }).onConflictDoNothing()
        }
      })
    )
  )
}
