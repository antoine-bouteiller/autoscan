import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { DateTime, Effect } from 'effect'

import { frenchProfiles, missingSubtitles, subtitleScans } from '@/database/schema'
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
    yield* Effect.promise(() => db.delete(frenchProfiles))
    yield* Effect.promise(() => db.delete(missingSubtitles))
    yield* Effect.promise(() => db.delete(subtitleScans))
  })

describe('subtitle scan repository', () => {
  beforeEach(() => Effect.runPromise(clean()))

  it.live('stores one verdict per hash and scan version across rebuilt layers', () =>
    Effect.gen(function* () {
      yield* provideTest(
        recordScan({ filePath: '/library/original.en.srt', hash: 'shared-content', scanVersion: 1, scannedAt: firstSeen, verdict: 'passed' })
      )
      yield* provideTest(
        recordScan({ filePath: '/library/renamed.en.srt', hash: 'shared-content', scanVersion: 1, scannedAt: later, verdict: 'sync_requested' })
      )
      yield* provideTest(
        recordScan({ filePath: '/library/renamed.en.srt', hash: 'shared-content', scanVersion: 2, scannedAt: later, verdict: 'sync_requested' })
      )

      expect(yield* provideTest(getScan('shared-content', 1))).toMatchObject({
        filePath: '/library/original.en.srt',
        scannedAt: firstSeen,
        verdict: 'passed',
      })
      expect(yield* provideTest(getScan('shared-content', 2))).toMatchObject({ verdict: 'sync_requested' })
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
