import { Effect, FileSystem, Option, Path } from 'effect'

import { deleteScans, listScanPaths, type SubtitleScanRecord } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'

export interface FileStat {
  readonly size: number
  readonly mtime: Date
}

export const statFile = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const info = yield* fs.stat(filePath)
    return { mtime: Option.getOrElse(info.mtime, () => new Date(0)), size: Number(info.size) } satisfies FileStat
  })

export const sameStat = (left: FileStat, right: FileStat) => left.size === right.size && left.mtime.getTime() === right.mtime.getTime()

/** A row applies to the file on disk only while its stored stat matches. */
export const isCounting = (row: SubtitleScanRecord | undefined, stat: FileStat): row is SubtitleScanRecord =>
  row !== undefined && row.fileSize !== null && row.fileMtime !== null && sameStat({ mtime: row.fileMtime, size: row.fileSize }, stat)

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
