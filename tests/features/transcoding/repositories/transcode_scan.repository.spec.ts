import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { DateTime, Effect } from 'effect'

import { transcodeScans } from '@/database/schema'
import { getScan, recordScan, type TranscodeScanKey } from '@/features/transcoding/repositories/transcode_scan.repository'

const scannedAt = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-01T00:00:00.000Z'))
const later = DateTime.toDateUtc(DateTime.makeUnsafe('2026-09-02T00:00:00.000Z'))

const clean = () => Effect.promise(() => db.delete(transcodeScans))

describe('transcode scan repository', () => {
  beforeEach(() => Effect.runPromise(clean()))

  it.live('looks up scans by every identity component', () =>
    Effect.gen(function* () {
      const row = {
        extension: '.mkv',
        filePath: '/library/movie.mkv',
        hash: 'shared-content',
        originalLanguage: 'en' as const,
        scanVersion: 1,
        scannedAt,
      }
      yield* provideTest(recordScan(row))

      const key: TranscodeScanKey = {
        extension: row.extension,
        hash: row.hash,
        originalLanguage: row.originalLanguage,
        scanVersion: row.scanVersion,
      }
      expect(yield* provideTest(getScan(key))).toMatchObject(row)
      expect(yield* provideTest(getScan({ ...key, extension: '.mp4' }))).toBeUndefined()
      expect(yield* provideTest(getScan({ ...key, originalLanguage: 'fr' }))).toBeUndefined()
      expect(yield* provideTest(getScan({ ...key, scanVersion: 2 }))).toBeUndefined()
      expect(yield* provideTest(getScan({ ...key, hash: 'other-content' }))).toBeUndefined()
    })
  )

  it.live('keeps the first matching record when inserts are retried', () =>
    Effect.gen(function* () {
      const key = { extension: '.mp4', hash: 'same-content', originalLanguage: 'en' as const, scanVersion: 1 }
      yield* provideTest(recordScan({ ...key, filePath: '/library/original.mp4', scannedAt }))
      yield* provideTest(recordScan({ ...key, filePath: '/library/renamed.mp4', scannedAt: later }))

      expect(yield* provideTest(getScan(key))).toMatchObject({ filePath: '/library/original.mp4', scannedAt })
    })
  )
})
