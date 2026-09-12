import { DateTime, Effect, FileSystem, Path } from 'effect'

import { Bazarr } from '@/core/runtime.service'
import { getFrenchProfile, insertFrenchProfile, markFrenchProfileReleased } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem } from '@/integrations/bazarr/bazarr.service'
import { type HttpClientError } from '@/shared/types/http_client'

export const applyFrenchProfilePolicy = (
  details: SubtitleScanMedia,
  getItem: Effect.Effect<BazarrItem | undefined, HttpClientError>,
  presetId: number | undefined
) =>
  Effect.gen(function* () {
    if (details.mediaType !== 'movie' || details.preferredLanguage !== 'fr' || presetId === undefined) {
      return
    }
    const item = yield* getItem
    if (item?.kind !== 'movie') {
      yield* Effect.logWarning(`No Bazarr movie for ${details.mediaTitle}`)
      return
    }
    const row = yield* getFrenchProfile(item)
    if (row !== undefined && row.releasedAt !== null) {
      return
    }
    const bazarr = yield* Bazarr
    const now = yield* DateTime.nowAsDate
    if (row === undefined) {
      yield* bazarr.setProfile(item, presetId)
      yield* insertFrenchProfile({ assignedAt: now, bazarrId: item.id, bazarrKind: item.kind })
      return
    }
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const base = path.basename(details.file, path.extname(details.file))
    if (yield* fs.exists(path.join(path.dirname(details.file), `${base}.fr.forced.srt`))) {
      return
    }
    if (row.assignedAt.getTime() < now.getTime() - 7 * 86_400_000) {
      // Bazarr's adapter uses null to clear a movie profile.
      // oxlint-disable-next-line unicorn/no-null
      yield* bazarr.setProfile(item, null)
      yield* markFrenchProfileReleased(item, now)
    }
  })
