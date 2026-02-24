import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { ISO1 } from '@/types/iso_codes'

export const media = sqliteTable(
  'media',
  {
    originalLanguage: text('original_language', { enum: ISO1 }).notNull(),
    preferredLanguage: text('preferred_language', { enum: ISO1 }).notNull(),
    title: text().notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    type: text().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tmdbId, table.type],
      name: 'media_tmdb_id_type_pk',
    }),
  ]
)

export const traktTokens = sqliteTable('trakt_tokens', {
  accessToken: text('access_token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  id: integer().primaryKey({ autoIncrement: true }),
  refreshToken: text('refresh_token').notNull(),
})

export const traktSyncHistory = sqliteTable('trakt_sync_history', {
  plexRatingKey: text('plex_rating_key').primaryKey(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
})

export type Media = typeof media.$inferSelect
export type TraktToken = typeof traktTokens.$inferSelect
export type TraktSyncHistory = typeof traktSyncHistory.$inferSelect
