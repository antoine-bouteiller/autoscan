import { beforeEach } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { DateTime, Effect, FileSystem } from 'effect'

import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { listScanPaths, recordScan } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { pruneMissingScans } from '@/features/subtitle_scan/services/scan_registry.service'

describe('pruneMissingScans', () => {
  beforeEach(async () => {
    await testSql`DELETE FROM subtitle_scans`
  })

  it.live('forgets deleted subtitles but keeps existing files and paths under a missing directory', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const kept = `${directory}/Movie.en.srt`
      const deleted = `${directory}/Movie.fr.srt`
      const unmounted = `${directory}/unmounted/Movie.de.srt`
      yield* fs.writeFileString(kept, '')
      const scannedAt = yield* DateTime.nowAsDate
      for (const filePath of [kept, deleted, unmounted]) {
        yield* provideTest(recordScan({ filePath, scanVersion: SUBTITLE_SCAN_VERSION, scannedAt, verdict: 'invalid' }))
      }

      yield* provideTest(pruneMissingScans)

      expect((yield* provideTest(listScanPaths)).toSorted()).toEqual([kept, unmounted])
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )
})
