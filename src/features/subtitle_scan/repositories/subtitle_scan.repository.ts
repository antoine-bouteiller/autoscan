import { and, eq, isNull, or } from 'drizzle-orm'
import { Effect } from 'effect'

import { DatabaseQueryError } from '@/config/db'
import { Database } from '@/core/runtime.service'
import { frenchProfiles, missingSubtitles, subtitleScans } from '@/database/schema'
import { type BazarrItemRef } from '@/integrations/bazarr/bazarr.service'

export type SubtitleScanRecord = typeof subtitleScans.$inferSelect
export type SubtitleVerdict = SubtitleScanRecord['verdict']
export type MissingSubtitleKey = Pick<typeof missingSubtitles.$inferSelect, 'bazarrKind' | 'bazarrId' | 'language'>
type BazarrMovieRef = Extract<BazarrItemRef, { kind: 'movie' }>

interface FrenchProfileInsert {
  assignedAt: Date
  bazarrId: number
  bazarrKind: 'movie'
}

const query = <Result>(run: () => Promise<Result>) => Effect.tryPromise({ catch: (cause) => new DatabaseQueryError(cause), try: run })

export const getScan = (hash: string, scanVersion: number) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .select()
        .from(subtitleScans)
        .where(and(eq(subtitleScans.hash, hash), eq(subtitleScans.scanVersion, scanVersion)))
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const recordScan = (row: SubtitleScanRecord) =>
  Database.use(({ db }) => query(() => db.insert(subtitleScans).values(row).onConflictDoNothing())).pipe(Effect.asVoid)

export const listMissing = Database.use(({ db }) => query(() => db.select().from(missingSubtitles)))

export const insertMissing = (row: MissingSubtitleKey & { firstSeenAt: Date }) =>
  Database.use(({ db }) => query(() => db.insert(missingSubtitles).values(row).onConflictDoNothing())).pipe(Effect.asVoid)

export const deleteMissing = (key: MissingSubtitleKey) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .delete(missingSubtitles)
        .where(
          and(
            eq(missingSubtitles.bazarrKind, key.bazarrKind),
            eq(missingSubtitles.bazarrId, key.bazarrId),
            eq(missingSubtitles.language, key.language)
          )
        )
    )
  ).pipe(Effect.asVoid)

export const markMissingActed = (keys: readonly MissingSubtitleKey[], actedAt: Date) => {
  if (keys.length === 0) {
    return Effect.void
  }
  return Database.use(({ db }) =>
    query(() =>
      db
        .update(missingSubtitles)
        .set({ actedAt })
        .where(
          and(
            isNull(missingSubtitles.actedAt),
            or(
              ...keys.map((key) =>
                and(
                  eq(missingSubtitles.bazarrKind, key.bazarrKind),
                  eq(missingSubtitles.bazarrId, key.bazarrId),
                  eq(missingSubtitles.language, key.language)
                )
              )
            )
          )
        )
    )
  ).pipe(Effect.asVoid)
}

export const getFrenchProfile = (movie: BazarrMovieRef) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .select()
        .from(frenchProfiles)
        .where(and(eq(frenchProfiles.bazarrKind, movie.kind), eq(frenchProfiles.bazarrId, movie.id)))
    ).pipe(Effect.map((rows) => rows[0]))
  )

export const insertFrenchProfile = (row: FrenchProfileInsert) =>
  Database.use(({ db }) => query(() => db.insert(frenchProfiles).values(row).onConflictDoNothing())).pipe(Effect.asVoid)

export const markFrenchProfileReleased = (movie: BazarrMovieRef, releasedAt: Date) =>
  Database.use(({ db }) =>
    query(() =>
      db
        .update(frenchProfiles)
        .set({ releasedAt })
        .where(and(eq(frenchProfiles.bazarrKind, movie.kind), eq(frenchProfiles.bazarrId, movie.id), isNull(frenchProfiles.releasedAt)))
    )
  ).pipe(Effect.asVoid)
