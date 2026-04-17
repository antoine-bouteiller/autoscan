import { eq } from 'drizzle-orm'

import { db } from '#config/db'
import { traktSyncHistory, traktTokens } from '#database/schema'

export const getToken = async () => {
  const result = await db.select().from(traktTokens).limit(1)
  return result[0]
}

export const upsertTokens = async (accessToken: string, refreshToken: string, expiresAt: number) => {
  const existing = await getToken()

  if (existing) {
    await db.update(traktTokens).set({ accessToken, expiresAt, refreshToken }).where(eq(traktTokens.id, existing.id))
    return
  }

  await db.insert(traktTokens).values({ accessToken, expiresAt, refreshToken })
}

export const getSyncedRatingKeys = async () => {
  const result = await db.select({ plexRatingKey: traktSyncHistory.plexRatingKey }).from(traktSyncHistory)
  return new Set(result.map((row) => row.plexRatingKey))
}

export const markManyAsSynced = async (ratingKeys: string[]) => {
  if (ratingKeys.length === 0) {
    return
  }

  const syncedAt = new Date()

  await db.transaction(async (tx) => {
    for (const plexRatingKey of ratingKeys) {
      await tx.insert(traktSyncHistory).values({ plexRatingKey, syncedAt }).onConflictDoNothing()
    }
  })
}
