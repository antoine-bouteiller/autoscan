import { ISO1 } from '@/types/iso_codes'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const media = sqliteTable(
  'media',
  {
    originalLanguage: text('original_language', { enum: ISO1 }).notNull(),
    title: text().notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    type: text().notNull(),
    wantedLanguage: text('wanted_language', { enum: ISO1 }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tmdbId, table.type],
      name: 'media_tmdb_id_type_pk',
    }),
  ]
)

export type Media = typeof media.$inferSelect
