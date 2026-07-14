import { integer, pgEnum, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core'

import { ISO1 } from '@/shared/types/iso_codes'

export const mediaTypeEnum = pgEnum('media_type', ['movie', 'show'])

export const media = pgTable(
  'media',
  {
    originalLanguage: text('original_language', { enum: ISO1 }).notNull(),
    preferredLanguage: text('preferred_language', { enum: ISO1 }).notNull(),
    title: text().notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    type: mediaTypeEnum().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tmdbId, table.type],
      name: 'media_tmdb_id_type_pk',
    }),
  ]
)

export const traktTokens = pgTable('trakt_tokens', {
  accessToken: text('access_token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  id: serial().primaryKey(),
  refreshToken: text('refresh_token').notNull(),
})

export const traktSyncHistory = pgTable('trakt_sync_history', {
  plexRatingKey: text('plex_rating_key').primaryKey(),
  syncedAt: timestamp('synced_at').notNull(),
})

export type Media = typeof media.$inferSelect
export type TraktToken = typeof traktTokens.$inferSelect
export type TraktSyncHistory = typeof traktSyncHistory.$inferSelect
