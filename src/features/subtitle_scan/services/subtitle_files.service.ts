import { Crypto, Effect, Encoding, FileSystem, Path } from 'effect'

import { type ISOCode1 } from '@/shared/types/iso_codes'
import { normalizeToIso1 } from '@/shared/utils/iso_codes'

export interface SubtitleFileSnapshot {
  readonly path: string
  readonly language: ISOCode1
  readonly forced: boolean
  readonly hash: string
  readonly content: string
}

export const discoverSubtitleFiles = (mediaFile: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const crypto = yield* Crypto.Crypto
    const directory = path.dirname(mediaFile)
    const base = path.basename(mediaFile, path.extname(mediaFile))
    const names = (yield* fs.readDirectory(directory)).toSorted()
    const prefix = `${base}.`
    const snapshots: SubtitleFileSnapshot[] = []

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
      const bytes = yield* fs.readFile(filePath)
      const digest = yield* crypto.digest('SHA-256', bytes)
      snapshots.push({
        content: new TextDecoder().decode(bytes),
        forced: match.groups['forced'] !== undefined,
        hash: Encoding.encodeHex(digest),
        language,
        path: filePath,
      })
    }

    return snapshots
  })
