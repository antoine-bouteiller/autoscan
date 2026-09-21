import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { makeTestDir } from '@tests/utils'
import { Effect, FileSystem, Path } from 'effect'

import { discoverSubtitleFiles, readSubtitleFile } from '@/features/subtitle_scan/services/subtitle_files.service'

describe('discoverSubtitleFiles', () => {
  it.live('discovers only exact recognized sidecars without reading their content', () =>
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
      expect(files).toEqual([
        { forced: false, language: 'en', path: subtitle },
        { forced: true, language: 'fr', path: path.join(directory, 'movie.part.1.fr.forced.srt') },
      ])
      const [first] = files
      if (first === undefined) {
        throw new Error('missing discovered subtitle')
      }
      expect((yield* readSubtitleFile(first)).content).toBe(new TextDecoder().decode(new Uint8Array([255, 0, 97])))
      yield* fs.remove(directory, { recursive: true })
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('requires an exact case-sensitive basename, sorts paths, and does not read files', () => {
    const fixtureFs = FileSystem.makeNoop({
      readDirectory: () => Effect.succeed(['Movie.fr.srt', 'movie.en.srt', 'Movie.en.srt']),
      readFile: () => Effect.die('discover must not read sidecars'),
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

  it.live('defers sidecar read failures until content is requested', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const media = path.join(directory, 'movie.mkv')
      const subtitle = path.join(directory, 'movie.en.srt')
      yield* fs.writeFileString(media, '')
      yield* fs.symlink(path.join(directory, 'missing.srt'), subtitle)
      const [file] = yield* discoverSubtitleFiles(media)
      if (file === undefined) {
        throw new Error('missing discovered subtitle')
      }
      expect(yield* Effect.exit(readSubtitleFile(file))).toSatisfy((exit) => exit._tag === 'Failure')
      yield* fs.remove(directory, { recursive: true })
    }).pipe(Effect.provide(BunServices.layer))
  )
})
