import { afterEach, beforeEach } from 'bun:test'

import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { getPlexToken, upsertPlexToken } from '@/features/plex_auth/repositories/plex_auth.repository'
import {
  getFrenchProfile,
  getScan as getSubtitleScan,
  insertFrenchProfile,
  insertMissing,
  listMissing,
  markFrenchProfileReleased,
  markMissingActed,
  recordScan as recordSubtitleScan,
} from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { getScan as getTranscodeScan, recordScan as recordTranscodeScan } from '@/features/transcoding/repositories/transcode_scan.repository'

const written = new Date('2026-03-08T07:30:15.123Z')
const utcWallClock = '2026-03-08 07:30:15.123'
const originalTz = process.env.TZ

const clean = async () => {
  await testSql`DELETE FROM french_profiles`
  await testSql`DELETE FROM missing_subtitles`
  await testSql`DELETE FROM plex_tokens`
  await testSql`DELETE FROM subtitle_scans`
  await testSql`DELETE FROM transcode_scans`
}

describe('[VC-8] timestamp columns outside UTC', () => {
  beforeEach(async () => {
    process.env.TZ = 'America/New_York'
    await clean()
  })

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it.live('round-trip every timestamp column and store UTC wall-clock time', () =>
    Effect.gen(function* () {
      expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0)
      const movie = { id: 1, kind: 'movie' as const }
      const missing = { bazarrId: 1, bazarrKind: 'movie' as const, language: 'en' as const }
      const transcode = { filePath: '/movie.mkv', originalLanguage: 'en' as const, scanVersion: 1 }

      yield* provideTest(recordSubtitleScan({ filePath: '/movie.en.srt', scanVersion: 1, scannedAt: written, verdict: 'passed' }))
      yield* provideTest(recordTranscodeScan({ ...transcode, scannedAt: written }))
      yield* provideTest(insertMissing({ ...missing, firstSeenAt: written }))
      yield* provideTest(markMissingActed([missing], written))
      yield* provideTest(insertFrenchProfile({ assignedAt: written, bazarrId: movie.id, bazarrKind: movie.kind }))
      yield* provideTest(markFrenchProfileReleased(movie, written))

      const subtitle = yield* provideTest(getSubtitleScan('/movie.en.srt', 1))
      const transcoded = yield* provideTest(getTranscodeScan(transcode))
      const [missingRow] = yield* provideTest(listMissing)
      const profile = yield* provideTest(getFrenchProfile(movie))
      const read = [
        subtitle?.scannedAt,
        transcoded?.scannedAt,
        missingRow?.firstSeenAt,
        missingRow?.actedAt,
        profile?.assignedAt,
        profile?.releasedAt,
      ]
      expect(read.map((date) => date?.toISOString())).toEqual(Array.from({ length: 6 }, () => written.toISOString()))

      const stored = yield* Effect.promise(
        () => testSql<{ value: string }[]>`
          SELECT scanned_at::text AS value FROM subtitle_scans
          UNION ALL SELECT scanned_at::text FROM transcode_scans
          UNION ALL SELECT first_seen_at::text FROM missing_subtitles
          UNION ALL SELECT acted_at::text FROM missing_subtitles
          UNION ALL SELECT assigned_at::text FROM french_profiles
          UNION ALL SELECT released_at::text FROM french_profiles
        `
      )
      expect(stored.map(({ value }) => value)).toEqual(Array.from({ length: 6 }, () => utcWallClock))
    })
  )

  it.live('round-trip the Plex link time as UTC', () =>
    Effect.gen(function* () {
      yield* provideTest(upsertPlexToken('token', 'client'))
      const token = yield* provideTest(getPlexToken)
      const [stored] = yield* Effect.promise(
        () => testSql<{ ms: number }[]>`SELECT round(extract(epoch FROM linked_at) * 1000)::float8 AS ms FROM plex_tokens`
      )

      expect(stored?.ms).toBe(token?.linkedAt.getTime())
    })
  )
})
