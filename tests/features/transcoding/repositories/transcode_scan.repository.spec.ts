import { beforeEach } from 'bun:test'

import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { DateTime, Effect } from 'effect'

import { getScan, recordScan, type TranscodeScanKey } from '@/features/transcoding/repositories/transcode_scan.repository'

const scannedAt = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-01T00:00:00.000Z'))
const later = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-02T00:00:00.000Z'))

const clean = () => Effect.promise(() => testSql`DELETE FROM transcode_scans`)

describe('transcode scan repository', () => {
  beforeEach(() => Effect.runPromise(clean()))

  it.live('looks up scans by every identity component', () =>
    Effect.gen(function* () {
      const row = {
        filePath: '/library/movie.mkv',
        originalLanguage: 'en' as const,
        scanVersion: 1,
        scannedAt,
      }
      yield* provideTest(recordScan(row))

      const key: TranscodeScanKey = {
        filePath: row.filePath,
        originalLanguage: row.originalLanguage,
        scanVersion: row.scanVersion,
      }
      expect(yield* provideTest(getScan(key))).toMatchObject(row)
      expect(yield* provideTest(getScan({ ...key, originalLanguage: 'fr' }))).toBeUndefined()
      expect(yield* provideTest(getScan({ ...key, scanVersion: 2 }))).toBeUndefined()
      expect(yield* provideTest(getScan({ ...key, filePath: '/other/movie.mkv' }))).toBeUndefined()
    })
  )

  it.live('updates the existing path record when language or scan version changes', () =>
    Effect.gen(function* () {
      const key = { filePath: '/library/original.mp4', originalLanguage: 'en' as const, scanVersion: 1 }
      yield* provideTest(recordScan({ ...key, scannedAt }))
      const french = { ...key, originalLanguage: 'fr' as const }
      yield* provideTest(recordScan({ ...french, scannedAt: later }))
      expect(yield* provideTest(getScan(key))).toBeUndefined()
      expect(yield* provideTest(getScan(french))).toMatchObject({ scannedAt: later })
      const versioned = { ...french, scanVersion: 2 }
      yield* provideTest(recordScan({ ...versioned, scannedAt: later }))
      expect(yield* provideTest(getScan(french))).toBeUndefined()
      expect(yield* provideTest(getScan(versioned))).toMatchObject({ scannedAt: later })
      expect(yield* Effect.promise(() => testSql`SELECT 1 FROM transcode_scans`)).toHaveLength(1)
    })
  )
})
