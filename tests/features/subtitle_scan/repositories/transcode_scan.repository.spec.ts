import { beforeEach } from 'bun:test'

import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { hasTranscodeScan } from '@/features/subtitle_scan/repositories/transcode_scan.repository'

describe('subtitle scan transcode lookup', () => {
  beforeEach(() => Effect.runPromise(Effect.promise(() => testSql`DELETE FROM transcode_scans`)))

  it.live('matches a row for the path and language at any scan version', () =>
    Effect.gen(function* () {
      yield* Effect.promise(
        () =>
          testSql`INSERT INTO transcode_scans (file_path, original_language, scan_version, scanned_at) VALUES ('/library/movie.mkv', 'en', 7, now())`
      )

      expect(yield* provideTest(hasTranscodeScan('/library/movie.mkv', 'en'))).toBe(true)
      expect(yield* provideTest(hasTranscodeScan('/library/movie.mkv', 'fr'))).toBe(false)
      expect(yield* provideTest(hasTranscodeScan('/library/other.mkv', 'en'))).toBe(false)
    })
  )
})
