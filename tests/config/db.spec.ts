import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, test } from 'vite-plus/test'

import { db } from '#config/db'
import { media as mediaTable, traktTokens } from '#database/schema'

describe('db', () => {
  afterEach(async () => {
    await db.delete(mediaTable)
    await db.delete(traktTokens)
  })

  test('should be initialized and able to execute a raw query', async () => {
    const result = await db.execute(sql`select 1 as count`)
    expect(result.rows?.[0]).toEqual({ count: 1 })
  })

  test('should have run migrations and expose the media table', async () => {
    const rows = await db.select().from(mediaTable)
    expect(Array.isArray(rows)).toBe(true)
  })

  test('should allow inserting and retrieving from a migrated table', async () => {
    await db.insert(mediaTable).values({
      originalLanguage: 'en',
      preferredLanguage: 'fr',
      title: 'db-test-title',
      tmdbId: 424_242,
      type: 'movie',
    })

    const rows = await db.select().from(mediaTable)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('db-test-title')
    expect(rows[0]?.preferredLanguage).toBe('fr')
  })
})
