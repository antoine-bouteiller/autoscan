import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const media = sqliteTable(
  'media',
  {
    tmdbId: integer('tmdb_id').notNull(),
    originalLanguage: text('original_language').notNull(),
    title: text().notNull(),
    type: text().notNull(),
  },
  (table) => [primaryKey({ name: 'media_tmdb_id_type_pk', columns: [table.tmdbId, table.type] })]
)

export type Media = typeof media.$inferSelect
