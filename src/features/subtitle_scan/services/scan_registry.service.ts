import { Effect, FileSystem, Path } from 'effect'

import { deleteScans, listScanPaths } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'

/** Drops registry rows whose subtitle file was deleted, so a later download at that path is scanned again. */
export const pruneMissingScans = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const stale: string[] = []
  for (const filePath of yield* listScanPaths) {
    // A missing directory usually means an unmounted library, not a deleted subtitle.
    if (!(yield* fs.exists(filePath)) && (yield* fs.exists(path.dirname(filePath)))) {
      stale.push(filePath)
    }
  }
  yield* deleteScans(stale)
  if (stale.length > 0) {
    yield* Effect.logInfo(`Pruned ${stale.length} subtitle scan records for deleted files`)
  }
})
