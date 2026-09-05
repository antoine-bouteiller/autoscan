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

export const plexTokens = pgTable('plex_tokens', {
  authToken: text('auth_token').notNull(),
  clientIdentifier: text('client_identifier').notNull(),
  id: serial().primaryKey(),
  linkedAt: timestamp('linked_at').notNull(),
})

export type Media = typeof media.$inferSelect
