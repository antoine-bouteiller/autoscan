import { integer, pgEnum, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core'

import { ISO1 } from '@/shared/types/iso_codes'

export const mediaTypeEnum = pgEnum('media_type', ['movie', 'show'])
export const subtitleVerdictEnum = pgEnum('subtitle_verdict', ['passed', 'forced_removed', 'sync_requested'])
export const bazarrKindEnum = pgEnum('bazarr_kind', ['movie', 'episode'])

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

export const subtitleScans = pgTable(
  'subtitle_scans',
  {
    filePath: text('file_path').notNull(),
    hash: text().notNull(),
    scanVersion: integer('scan_version').notNull(),
    scannedAt: timestamp('scanned_at').notNull(),
    verdict: subtitleVerdictEnum().notNull(),
  },
  (table) => [primaryKey({ columns: [table.hash, table.scanVersion] })]
)

export const missingSubtitles = pgTable(
  'missing_subtitles',
  {
    actedAt: timestamp('acted_at'),
    bazarrId: integer('bazarr_id').notNull(),
    bazarrKind: bazarrKindEnum('bazarr_kind').notNull(),
    firstSeenAt: timestamp('first_seen_at').notNull(),
    language: text({ enum: ISO1 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.bazarrKind, table.bazarrId, table.language] })]
)

export const frenchProfiles = pgTable(
  'french_profiles',
  {
    assignedAt: timestamp('assigned_at').notNull(),
    bazarrId: integer('bazarr_id').notNull(),
    bazarrKind: bazarrKindEnum('bazarr_kind').notNull(),
    releasedAt: timestamp('released_at'),
  },
  (table) => [primaryKey({ columns: [table.bazarrKind, table.bazarrId] })]
)

export type Media = typeof media.$inferSelect
