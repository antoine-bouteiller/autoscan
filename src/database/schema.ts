import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const media = sqliteTable(
  'media',
  {
    originalLanguage: text('original_language').notNull(),
    title: text().notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    type: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tmdbId, table.type], name: 'media_tmdb_id_type_pk' })]
)

export type Media = typeof media.$inferSelect
