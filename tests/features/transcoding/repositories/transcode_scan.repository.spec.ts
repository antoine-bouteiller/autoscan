import { beforeEach } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { sql } from 'drizzle-orm'
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

  it.live('migrates both scan tables together, retaining the latest record per path', () =>
    Effect.gen(function* () {
      const [previous, subtitleSchema, migration] = yield* Effect.all([
        Effect.promise(() => Bun.file('migrations/20260921160752_chemical_blue_marvel/migration.sql').text()),
        Effect.promise(() => Bun.file('migrations/20260912073633_subtitle_scan/migration.sql').text()),
        Effect.promise(() => Bun.file('migrations/20260921190858_scan_path_primary_keys/migration.sql').text()),
      ])
      const subtitleTable = subtitleSchema.slice(subtitleSchema.indexOf('CREATE TABLE "subtitle_scans"'))
      const context = yield* Effect.context()

      yield* Effect.promise(() =>
        db.transaction((tx) =>
          Effect.runPromiseWith(context)(
            Effect.gen(function* () {
              yield* Effect.promise(() =>
                tx.execute(sql.raw(previous.replace('CREATE TABLE', 'CREATE TEMP TABLE').replace(');', ') ON COMMIT DROP;')))
              )
              yield* Effect.promise(() =>
                tx.execute(sql.raw(subtitleTable.replace('CREATE TABLE', 'CREATE TEMP TABLE').replace(');', ') ON COMMIT DROP;')))
              )
              yield* Effect.promise(() =>
                tx.execute(sql`
                  INSERT INTO subtitle_scans (hash, file_path, scan_version, scanned_at, verdict) VALUES
                    ('old', '/movie.en.srt', 1, '2026-09-01', 'sync_requested'),
                    ('same-date', '/movie.en.srt', 1, '2026-09-01', 'forced_removed'),
                    ('new', '/movie.en.srt', 1, '2026-09-02', 'passed'),
                    ('new', '/movie.en.srt', 2, '2026-09-03', 'passed'),
                    ('other', '/other/movie.en.srt', 1, '2026-09-01', 'forced_removed'),
                    ('tied-old', '/tied.en.srt', 1, '2026-09-02', 'passed'),
                    ('tied-new', '/tied.en.srt', 2, '2026-09-02', 'sync_requested')
                `)
              )
              yield* Effect.promise(() =>
                tx.execute(sql`
                  INSERT INTO transcode_scans (hash, extension, file_path, original_language, scan_version, scanned_at) VALUES
                    ('old', 'mp4', '/movie.mp4', 'en', 1, '2026-09-01'),
                    ('same-date', 'mp4', '/movie.mp4', 'en', 1, '2026-09-01'),
                    ('new', 'mp4', '/movie.mp4', 'en', 1, '2026-09-02'),
                    ('new', 'mp4', '/movie.mp4', 'fr', 1, '2026-09-01'),
                    ('new', 'mp4', '/movie.mp4', 'fr', 2, '2026-09-03'),
                    ('other', 'mp4', '/other/movie.mp4', 'en', 1, '2026-09-01'),
                    ('tied-old', 'mp4', '/tied.mp4', 'en', 1, '2026-09-02'),
                    ('tied-new', 'mp4', '/tied.mp4', 'fr', 2, '2026-09-02')
                `)
              )
              for (const statement of migration.split('--> statement-breakpoint')) {
                yield* Effect.promise(() => tx.execute(sql.raw(statement)))
              }
              yield* Effect.promise(() =>
                tx.execute(sql`
                  INSERT INTO transcode_scans (file_path, original_language, scan_version, scanned_at)
                  VALUES ('/movie.mp4', 'de', 99, '2026-09-04') ON CONFLICT DO NOTHING
                `)
              )
              yield* Effect.promise(() =>
                tx.execute(sql`
                  INSERT INTO subtitle_scans (file_path, scan_version, scanned_at, verdict)
                  VALUES ('/movie.en.srt', 99, '2026-09-04', 'sync_requested') ON CONFLICT DO NOTHING
                `)
              )
              const subtitles = yield* Effect.promise(() =>
                tx.execute(sql`
                  SELECT file_path, scan_version, scanned_at::text, verdict FROM subtitle_scans ORDER BY file_path
                `)
              )
              expect([...subtitles]).toEqual([
                { file_path: '/movie.en.srt', scan_version: 2, scanned_at: '2026-09-03 00:00:00', verdict: 'passed' },
                { file_path: '/other/movie.en.srt', scan_version: 1, scanned_at: '2026-09-01 00:00:00', verdict: 'forced_removed' },
                { file_path: '/tied.en.srt', scan_version: 2, scanned_at: '2026-09-02 00:00:00', verdict: 'sync_requested' },
              ])
              const rows = yield* Effect.promise(() =>
                tx.execute(sql`
                  SELECT file_path, original_language, scan_version, scanned_at::text
                  FROM transcode_scans ORDER BY file_path, original_language, scan_version
                `)
              )
              expect([...rows]).toEqual([
                { file_path: '/movie.mp4', original_language: 'fr', scan_version: 2, scanned_at: '2026-09-03 00:00:00' },
                { file_path: '/other/movie.mp4', original_language: 'en', scan_version: 1, scanned_at: '2026-09-01 00:00:00' },
                { file_path: '/tied.mp4', original_language: 'fr', scan_version: 2, scanned_at: '2026-09-02 00:00:00' },
              ])
            })
          )
        )
      )
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
      expect(yield* Effect.promise(() => db.select().from(transcodeScans))).toHaveLength(1)
    })
  )
})
