import { beforeEach } from 'bun:test'

import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { DateTime, Effect } from 'effect'

import {
  deleteMissing,
  getFrenchProfile,
  getScan,
  insertFrenchProfile,
  insertMissing,
  listMissing,
  markFrenchProfileReleased,
  markMissingActed,
  recordScan,
} from '@/features/subtitle_scan/repositories/subtitle_scan.repository'

const firstSeen = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-01T00:00:00.000Z'))
const later = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-02T00:00:00.000Z'))
const retriedAt = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-03T00:00:00.000Z'))
const reappearedAt = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-04T00:00:00.000Z'))

const clean = () =>
  Effect.gen(function* () {
    yield* Effect.promise(() => testSql`DELETE FROM french_profiles`)
    yield* Effect.promise(() => testSql`DELETE FROM missing_subtitles`)
    yield* Effect.promise(() => testSql`DELETE FROM subtitle_scans`)
  })

describe('subtitle scan repository', () => {
  beforeEach(() => Effect.runPromise(clean()))

  it.live('updates one verdict per full path across scan versions and rebuilt layers', () =>
    Effect.gen(function* () {
      const filePath = '/library/movie.en.srt'
      yield* provideTest(recordScan({ filePath, scanVersion: 1, scannedAt: firstSeen, verdict: 'passed' }))
      expect(yield* provideTest(getScan(filePath, 1))).toMatchObject({ filePath, scannedAt: firstSeen, verdict: 'passed' })
      yield* provideTest(recordScan({ filePath, scanVersion: 2, scannedAt: later, verdict: 'sync_requested' }))
      yield* provideTest(recordScan({ filePath: '/other/movie.en.srt', scanVersion: 1, scannedAt: later, verdict: 'forced_removed' }))

      expect(yield* provideTest(getScan(filePath, 1))).toBeUndefined()
      expect(yield* provideTest(getScan(filePath, 2))).toMatchObject({ scannedAt: later, verdict: 'sync_requested' })
      expect(yield* Effect.promise(() => testSql`SELECT 1 FROM subtitle_scans`)).toHaveLength(2)
      expect(yield* provideTest(getScan('/other/movie.en.srt', 1))).toMatchObject({ verdict: 'forced_removed' })
      expect(yield* provideTest(getScan('/library/renamed.en.srt', 1))).toBeUndefined()
      expect(yield* provideTest(getScan(filePath, 3))).toBeUndefined()
    })
  )

  it.live('preserves missing clocks, distinguishes movie and episode IDs, and restarts after deletion', () =>
    Effect.gen(function* () {
      const movie = { bazarrId: 7, bazarrKind: 'movie' as const, language: 'en' as const }
      const episode = { bazarrId: 7, bazarrKind: 'episode' as const, language: 'en' as const }
      yield* provideTest(insertMissing({ ...movie, firstSeenAt: firstSeen }))
      yield* provideTest(insertMissing({ ...movie, firstSeenAt: later }))
      yield* provideTest(insertMissing({ ...episode, firstSeenAt: later }))
      yield* provideTest(markMissingActed([movie, episode], later))
      yield* provideTest(markMissingActed([movie], retriedAt))

      expect(yield* provideTest(listMissing)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ...movie, actedAt: later, firstSeenAt: firstSeen }),
          expect.objectContaining({ ...episode, actedAt: later, firstSeenAt: later }),
        ])
      )

      yield* provideTest(deleteMissing(movie))
      yield* provideTest(insertMissing({ ...movie, firstSeenAt: reappearedAt }))
      const reappearedRows = yield* provideTest(listMissing)
      expect(reappearedRows).toEqual(expect.arrayContaining([expect.objectContaining({ ...movie, firstSeenAt: reappearedAt })]))
      expect(reappearedRows.find((row) => row.bazarrId === movie.bazarrId && row.bazarrKind === movie.bazarrKind)?.actedAt).toBeNull()
    })
  )

  it.live('[VC-8] marks exactly the matching unacted keys across both Bazarr kinds', () =>
    Effect.gen(function* () {
      const movieEn = { bazarrId: 1, bazarrKind: 'movie' as const, language: 'en' as const }
      const episodeEn = { bazarrId: 1, bazarrKind: 'episode' as const, language: 'en' as const }
      const episodeFr = { bazarrId: 2, bazarrKind: 'episode' as const, language: 'fr' as const }
      const movieFr = { bazarrId: 2, bazarrKind: 'movie' as const, language: 'fr' as const }
      const alreadyActed = { bazarrId: 3, bazarrKind: 'movie' as const, language: 'de' as const }
      const keys = [movieEn, episodeEn, episodeFr, movieFr, alreadyActed]
      for (const key of keys) {
        yield* provideTest(insertMissing({ ...key, firstSeenAt: firstSeen }))
      }
      yield* provideTest(markMissingActed([alreadyActed], later))

      yield* provideTest(markMissingActed([movieEn, episodeFr, alreadyActed, { ...movieFr, language: 'en' }], retriedAt))

      const rows = yield* provideTest(listMissing)
      const actedAt = keys.map(
        (key) =>
          rows.find((row) => row.bazarrKind === key.bazarrKind && row.bazarrId === key.bazarrId && row.language === key.language)?.actedAt ??
          undefined
      )
      expect(actedAt).toEqual([retriedAt, undefined, retriedAt, undefined, later])
    })
  )

  it.live('preserves assignment and terminal release state across rebuilt layers', () =>
    Effect.gen(function* () {
      const movie = { id: 42, kind: 'movie' as const }
      yield* provideTest(insertFrenchProfile({ assignedAt: firstSeen, bazarrId: movie.id, bazarrKind: movie.kind }))
      yield* provideTest(insertFrenchProfile({ assignedAt: later, bazarrId: movie.id, bazarrKind: movie.kind }))
      yield* provideTest(markFrenchProfileReleased(movie, later))
      yield* provideTest(markFrenchProfileReleased(movie, retriedAt))

      expect(yield* provideTest(getFrenchProfile(movie))).toMatchObject({ assignedAt: firstSeen, releasedAt: later })
    })
  )
})
