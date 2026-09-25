import { Cause, DateTime, Effect, FileSystem, Path } from 'effect'

import { Bazarr } from '@/core/runtime.service'
import { getFrenchProfile, insertFrenchProfile, markFrenchProfileReleased } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { discoverSubtitleFiles } from '@/features/subtitle_scan/services/subtitle_files.service'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem } from '@/integrations/bazarr/bazarr.service'
import { type HttpClientError } from '@/shared/types/http_client'

export const applyFrenchProfilePolicy = (
  details: SubtitleScanMedia,
  getItem: Effect.Effect<BazarrItem | undefined, HttpClientError>,
  presetId: number | undefined
) =>
  Effect.gen(function* () {
    if (details.mediaType !== 'movie' || details.preferredLanguage !== 'fr') {
      return
    }
    const item = yield* getItem
    if (item?.kind !== 'movie' || item.path !== details.file) {
      yield* Effect.logWarning(`No Bazarr movie for ${details.mediaTitle}`)
      return
    }
    const row = yield* getFrenchProfile(item)
    const bazarr = yield* Bazarr
    const now = yield* DateTime.nowAsDate
    if (row === undefined) {
      if (presetId === undefined) {
        yield* Effect.logWarning(`No Bazarr French preset for ${details.mediaTitle}; deferring subtitle cleanup`)
        return
      }
      yield* bazarr.setProfile(item, presetId)
      yield* insertFrenchProfile({ assignedAt: now, bazarrId: item.id, bazarrKind: item.kind })
    } else if (row.releasedAt === null) {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const base = path.basename(details.file, path.extname(details.file))
      const forced = yield* fs.exists(path.join(path.dirname(details.file), `${base}.fr.forced.srt`))
      if (!forced && row.assignedAt.getTime() < now.getTime() - 7 * 86_400_000) {
        // Bazarr's adapter uses null to clear a movie profile.
        // oxlint-disable-next-line unicorn/no-null
        yield* bazarr.setProfile(item, null)
        yield* markFrenchProfileReleased(item, now)
      }
    }
    const files = yield* discoverSubtitleFiles(details.file)
    for (const file of files) {
      if (file.forced) {
        continue
      }
      const subtitle = item.subtitles.find((entry) => entry.path === file.path && !entry.forced)
      if (subtitle === undefined) {
        yield* Effect.logWarning(`Bazarr subtitle not found for French movie sidecar ${file.path}`)
        continue
      }
      yield* bazarr.deleteSubtitle(item, subtitle).pipe(
        Effect.catchCauseIf(
          (cause) => !Cause.hasInterrupts(cause),
          (cause) => Effect.logWarning(cause, `Removing French movie subtitle ${file.path}`)
        )
      )
    }
  })
