import { Effect, FileSystem, Path } from 'effect'

import { Bazarr } from '@/core/runtime.service'
import { DELETE_SUBTITLE_ACTION, SUBTITLE_SCAN_VERSION, VIDEO_EXTENSIONS } from '@/features/subtitle_scan/constants'
import { deleteScans, listScans } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { type InlineKeyboardButton } from '@/providers/telegram/types'

// Telegram caps callback data at 64 bytes, so buttons carry a path digest instead of the path.
const subtitleKey = (filePath: string) => Bun.hash(filePath).toString(36)

export const deleteSubtitleButton = (filePath: string, text: string): InlineKeyboardButton => ({
  callback_data: `${DELETE_SUBTITLE_ACTION}:${subtitleKey(filePath)}`,
  text,
})

export const listInvalidSubtitles = listScans('invalid', SUBTITLE_SCAN_VERSION).pipe(Effect.map((rows) => rows.map((row) => row.filePath)))

const findBazarrItem = (subtitlePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const bazarr = yield* Bazarr
    const directory = path.dirname(subtitlePath)
    const base = path.basename(subtitlePath).replace(/\.[^.]+\.srt$/i, '')
    for (const name of (yield* fs.readDirectory(directory)).toSorted()) {
      if (!name.startsWith(`${base}.`) || !VIDEO_EXTENSIONS.has(name.slice(base.length + 1).toLowerCase())) {
        continue
      }
      const mediaFile = path.join(directory, name)
      const item = (yield* bazarr.getEpisodeByPath(mediaFile)) ?? (yield* bazarr.getMovieByPath(mediaFile))
      if (item !== undefined) {
        return item
      }
    }
    return undefined
  })

/** Deletes an invalid subtitle through Bazarr and forgets its verdict; returns the reply for the operator. */
export const deleteInvalidSubtitle = (key: string) =>
  Effect.gen(function* () {
    const filePath = (yield* listInvalidSubtitles).find((candidate) => subtitleKey(candidate) === key)
    if (filePath === undefined) {
      return 'This subtitle is no longer marked invalid.'
    }
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const name = path.basename(filePath)
    if (!(yield* fs.exists(filePath))) {
      yield* deleteScans([filePath])
      return `${name} was already deleted.`
    }
    const item = yield* findBazarrItem(filePath)
    const subtitle = item?.subtitles.find((candidate) => candidate.path === filePath)
    if (item === undefined || subtitle === undefined) {
      yield* Effect.logWarning(`Bazarr subtitle not found for invalid sidecar ${filePath}`)
      return `Bazarr does not track ${name}; it was not deleted.`
    }
    yield* (yield* Bazarr).deleteSubtitle(item, subtitle)
    yield* deleteScans([filePath])
    yield* Effect.logInfo(`Deleted invalid subtitle ${filePath}`)
    return `Deleted ${name}.`
  })
