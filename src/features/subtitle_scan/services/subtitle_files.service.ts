import { Effect, FileSystem, Path } from 'effect'

import { type ISOCode1 } from '@/shared/types/iso_codes'
import { normalizeToIso1 } from '@/shared/utils/iso_codes'

export interface SubtitleFile {
  readonly path: string
  readonly language: ISOCode1
  readonly forced: boolean
}

export interface SubtitleFileSnapshot extends SubtitleFile {
  readonly content: string
}

export const discoverSubtitleFiles = (mediaFile: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = path.dirname(mediaFile)
    const base = path.basename(mediaFile, path.extname(mediaFile))
    const names = (yield* fs.readDirectory(directory)).toSorted()
    const prefix = `${base}.`
    const files: SubtitleFile[] = []

    for (const name of names) {
      if (!name.startsWith(prefix)) {
        continue
      }
      const match = /^(?<language>[^.]+)(?<forced>\.forced)?\.srt$/i.exec(name.slice(prefix.length))
      if (match?.groups === undefined) {
        continue
      }
      const language = normalizeToIso1(match.groups['language'])
      if (language === undefined) {
        continue
      }

      const filePath = path.join(directory, name)
      files.push({ forced: match.groups['forced'] !== undefined, language, path: filePath })
    }

    return files
  })

export const readSubtitleFile = (file: SubtitleFile) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const bytes = yield* fs.readFile(file.path)
    return { ...file, content: new TextDecoder().decode(bytes) }
  })
