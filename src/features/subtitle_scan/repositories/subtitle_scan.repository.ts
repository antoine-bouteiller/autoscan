import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { type FrenchProfile, type MissingSubtitle, type SubtitleScan } from '@/database/schema'
import { type BazarrItemRef } from '@/integrations/bazarr/bazarr.service'

export type SubtitleScanRecord = SubtitleScan
export type SubtitleVerdict = SubtitleScanRecord['verdict']
export type MissingSubtitleKey = Pick<MissingSubtitle, 'bazarrKind' | 'bazarrId' | 'language'>
type BazarrMovieRef = Extract<BazarrItemRef, { kind: 'movie' }>

interface FrenchProfileInsert {
  assignedAt: Date
  bazarrId: number
  bazarrKind: 'movie'
}

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const getScan = (filePath: string, scanVersion: number) =>
  Database.use(({ sql }) =>
    query(
      () => sql<SubtitleScanRecord[]>`
        SELECT file_path AS "filePath", scan_version AS "scanVersion", scanned_at AS "scannedAt", verdict
        FROM subtitle_scans
        WHERE file_path = ${filePath} AND scan_version = ${scanVersion}
      `
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const recordScan = (row: SubtitleScanRecord) =>
  Database.use(({ sql }) =>
    query(
      () => sql`
        INSERT INTO subtitle_scans (file_path, scan_version, scanned_at, verdict)
        VALUES (${row.filePath}, ${row.scanVersion}, ${row.scannedAt}, ${row.verdict})
        ON CONFLICT (file_path) DO UPDATE SET
          scan_version = EXCLUDED.scan_version,
          scanned_at = EXCLUDED.scanned_at,
          verdict = EXCLUDED.verdict
      `
    )
  ).pipe(Effect.asVoid)

export const listMissing = Database.use(({ sql }) =>
  query(
    () => sql<MissingSubtitle[]>`
      SELECT bazarr_kind AS "bazarrKind", bazarr_id AS "bazarrId", language, first_seen_at AS "firstSeenAt", acted_at AS "actedAt"
      FROM missing_subtitles
    `
  )
)

export const insertMissing = (row: MissingSubtitleKey & { firstSeenAt: Date }) =>
  Database.use(({ sql }) =>
    query(
      () => sql`
        INSERT INTO missing_subtitles (bazarr_kind, bazarr_id, language, first_seen_at)
        VALUES (${row.bazarrKind}, ${row.bazarrId}, ${row.language}, ${row.firstSeenAt})
        ON CONFLICT DO NOTHING
      `
    )
  ).pipe(Effect.asVoid)

export const deleteMissing = (key: MissingSubtitleKey) =>
  Database.use(({ sql }) =>
    query(
      () => sql`
        DELETE FROM missing_subtitles
        WHERE bazarr_kind = ${key.bazarrKind} AND bazarr_id = ${key.bazarrId} AND language = ${key.language}
      `
    )
  ).pipe(Effect.asVoid)

export const markMissingActed = (keys: readonly MissingSubtitleKey[], actedAt: Date) => {
  if (keys.length === 0) {
    return Effect.void
  }
  return Database.use(({ sql }) => {
    const kinds = sql.array(
      keys.map((key) => key.bazarrKind),
      'text'
    )
    const ids = sql.array(
      keys.map((key) => key.bazarrId),
      'int4'
    )
    const languages = sql.array(
      keys.map((key) => key.language),
      'text'
    )
    return query(
      () => sql`
        UPDATE missing_subtitles SET acted_at = ${actedAt}
        WHERE acted_at IS NULL
          AND (bazarr_kind, bazarr_id, language) IN (SELECT * FROM unnest(${kinds}::bazarr_kind[], ${ids}::int[], ${languages}::text[]))
      `
    )
  }).pipe(Effect.asVoid)
}

export const getFrenchProfile = (movie: BazarrMovieRef) =>
  Database.use(({ sql }) =>
    query(
      () => sql<FrenchProfile[]>`
        SELECT bazarr_kind AS "bazarrKind", bazarr_id AS "bazarrId", assigned_at AS "assignedAt", released_at AS "releasedAt"
        FROM french_profiles
        WHERE bazarr_kind = ${movie.kind} AND bazarr_id = ${movie.id}
      `
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const insertFrenchProfile = (row: FrenchProfileInsert) =>
  Database.use(({ sql }) =>
    query(
      () => sql`
        INSERT INTO french_profiles (bazarr_kind, bazarr_id, assigned_at)
        VALUES (${row.bazarrKind}, ${row.bazarrId}, ${row.assignedAt})
        ON CONFLICT DO NOTHING
      `
    )
  ).pipe(Effect.asVoid)

export const markFrenchProfileReleased = (movie: BazarrMovieRef, releasedAt: Date) =>
  Database.use(({ sql }) =>
    query(
      () => sql`
        UPDATE french_profiles SET released_at = ${releasedAt}
        WHERE bazarr_kind = ${movie.kind} AND bazarr_id = ${movie.id} AND released_at IS NULL
      `
    )
  ).pipe(Effect.asVoid)
