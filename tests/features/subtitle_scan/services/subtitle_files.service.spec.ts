import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { makeTestDir } from '@tests/utils'
import { Effect, FileSystem, Path } from 'effect'

import { discoverSubtitleFiles } from '@/features/subtitle_scan/services/subtitle_files.service'

describe('discoverSubtitleFiles', () => {
  it.live('discovers only exact recognized sidecars and snapshots their raw bytes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const media = path.join(directory, 'movie.part.1.mkv')
      const subtitle = path.join(directory, 'movie.part.1.eng.srt')
      yield* fs.writeFileString(media, '')
      yield* fs.writeFile(subtitle, new Uint8Array([255, 0, 97]))
      yield* fs.writeFileString(path.join(directory, 'movie.part.1.fr.forced.srt'), 'forced')
      yield* fs.writeFileString(path.join(directory, 'movie.part.1.en.extra.srt'), 'ignored')
      yield* fs.writeFileString(path.join(directory, 'movie.part.10.en.srt'), 'neighbor')
      yield* fs.writeFileString(path.join(directory, 'movie.part.1.xx.srt'), 'unknown')

      const files = yield* discoverSubtitleFiles(media)
      expect(files.map(({ path: filePath, language, forced }) => ({ forced, language, path: filePath }))).toEqual([
        { forced: false, language: 'en', path: subtitle },
        { forced: true, language: 'fr', path: path.join(directory, 'movie.part.1.fr.forced.srt') },
      ])
      expect(files[0]?.hash).toBe('f9789675a25a87605b0d60387568e25cda7b568653ecdc42e9248588dc70acd5')
      expect(files[0]?.content).toBe(new TextDecoder().decode(new Uint8Array([255, 0, 97])))
      yield* fs.remove(directory, { recursive: true })
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('requires an exact case-sensitive basename and sorts snapshots', () => {
    const contents = new Map([
      ['/library/Movie.en.srt', new TextEncoder().encode('english')],
      ['/library/Movie.fr.srt', new TextEncoder().encode('french')],
    ])
    const fixtureFs = FileSystem.makeNoop({
      readDirectory: () => Effect.succeed(['Movie.fr.srt', 'movie.en.srt', 'Movie.en.srt']),
      readFile: (filePath) => Effect.succeed(contents.get(filePath) ?? new Uint8Array()),
    })

    return discoverSubtitleFiles('/library/Movie.mkv').pipe(
      Effect.provideService(FileSystem.FileSystem, fixtureFs),
      Effect.provide(BunServices.layer),
      Effect.tap((files) =>
        Effect.sync(() => {
          expect(files.map((file) => file.path)).toEqual(['/library/Movie.en.srt', '/library/Movie.fr.srt'])
        })
      )
    )
  })

  it.live('fails when an exact matching sidecar cannot be read', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const media = path.join(directory, 'movie.mkv')
      yield* fs.writeFileString(media, '')
      yield* fs.symlink(path.join(directory, 'missing.srt'), path.join(directory, 'movie.en.srt'))
      expect(yield* Effect.exit(discoverSubtitleFiles(media))).toSatisfy((exit) => exit._tag === 'Failure')
      yield* fs.remove(directory, { recursive: true })
    }).pipe(Effect.provide(BunServices.layer))
  )
})
