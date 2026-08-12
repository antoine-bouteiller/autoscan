import { afterEach } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { makeTestDir, videosPath } from '@tests/utils'
import { Cause, Effect, Exit, Fiber, FileSystem, Latch, Path, PlatformError, Result } from 'effect'

import env from '@/config/env'
import { FileAccessError } from '@/features/transcoding/errors'
import { handlePostTranscode, replaceOutputs } from '@/features/transcoding/services/helpers/post_process'

const directories: string[] = []

const fsyncWith = (fs: FileSystem.FileSystem) => (target: string) => Effect.scoped(Effect.flatMap(fs.open(target), (file) => file.sync))

afterEach(() =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      for (const directory of directories.splice(0)) {
        yield* fs.remove(directory, { force: true, recursive: true })
      }
    }).pipe(Effect.provide(BunServices.layer))
  )
)

describe('handlePostTranscode', () => {
  it.live('does nothing when no transcode output exists', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      directories.push(directory)
      expect(yield* handlePostTranscode({ filePath: path.join(directory, 'missing.mkv'), mediaTitle: 'Missing', mediaType: 'movie' })).toBeUndefined()
    }).pipe(provideTest)
  )

  it.live('durably replaces the original with validated output', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      directories.push(directory)
      const original = path.join(directory, 'movie.mkv')
      yield* fs.writeFileString(original, 'original')

      const outputDirectory = path.join(env.TRANSCODE_PATH, path.basename(original, '.mkv'))
      directories.push(outputDirectory)
      yield* fs.makeDirectory(outputDirectory, { recursive: true })
      yield* fs.copyFile(path.join(videosPath, 'test_correct_file.mp4'), path.join(outputDirectory, 'movie.mp4'))

      yield* handlePostTranscode({ filePath: original, mediaTitle: 'Movie', mediaType: 'movie' })

      expect(yield* fs.exists(original)).toBeFalse()
      expect(yield* fs.exists(path.join(directory, 'movie.mp4'))).toBeTrue()
      expect((yield* fs.readFile(path.join(directory, 'movie.mp4'))).byteLength).toBeGreaterThan(0)
      expect(yield* fs.exists(outputDirectory)).toBeFalse()
    }).pipe(provideTest)
  )

  it.live('replaces a colliding destination without leaving backups', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      directories.push(directory)
      const original = path.join(directory, 'movie.mkv')
      const destination = path.join(directory, 'movie.mp4')
      yield* fs.writeFileString(original, 'original')
      yield* fs.writeFileString(destination, 'collision')

      const outputDirectory = path.join(env.TRANSCODE_PATH, path.basename(original, '.mkv'))
      directories.push(outputDirectory)
      yield* fs.makeDirectory(outputDirectory, { recursive: true })
      yield* fs.copyFile(path.join(videosPath, 'test_correct_file.mp4'), path.join(outputDirectory, 'movie.mp4'))

      yield* handlePostTranscode({ filePath: original, mediaTitle: 'Movie', mediaType: 'movie' })
      expect(yield* fs.readFileString(destination)).not.toBe('collision')
      expect((yield* fs.readDirectory(directory)).some((entry) => entry.includes('autoscan-backup'))).toBeFalse()
    }).pipe(provideTest)
  )

  it.live('keeps the durable installation when backup cleanup fails', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const outputDirectory = path.join(directory, 'output')
      directories.push(directory)
      yield* fs.makeDirectory(outputDirectory)
      const original = path.join(directory, 'movie.mkv')
      const destination = path.join(directory, 'movie.mp4')
      yield* fs.writeFileString(original, 'original')
      yield* fs.writeFileString(path.join(outputDirectory, 'movie.mp4'), 'new')

      const result = yield* Effect.result(
        replaceOutputs(original, outputDirectory, {
          operations: {
            copyFile: fs.copyFile,
            exists: fs.exists,
            fsync: fsyncWith(fs),
            remove: (target, options) =>
              target.includes('autoscan-backup')
                ? Effect.fail(PlatformError.badArgument({ description: 'cleanup failed', method: 'remove', module: 'FileSystem' }))
                : fs.remove(target, options),
            rename: fs.rename,
          },
          outputFiles: ['movie.mp4'],
        })
      )

      expect(Result.isSuccess(result) && result.success).toBeInstanceOf(FileAccessError)
      expect(yield* fs.readFileString(destination)).toBe('new')
      expect((yield* fs.readDirectory(directory)).some((entry) => entry.includes('autoscan-backup'))).toBeTrue()
    }).pipe(provideTest)
  )

  it.live('rolls back an installed output when the commit fsync fails', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const outputDirectory = path.join(directory, 'output')
      directories.push(directory)
      yield* fs.makeDirectory(outputDirectory)
      const original = path.join(directory, 'movie.mkv')
      const destination = path.join(directory, 'movie.mp4')
      yield* fs.writeFileString(original, 'original')
      yield* fs.writeFileString(path.join(outputDirectory, 'movie.mp4'), 'new')
      const fsync = fsyncWith(fs)
      let directorySyncs = 0

      const result = yield* Effect.result(
        replaceOutputs(original, outputDirectory, {
          operations: {
            copyFile: fs.copyFile,
            exists: fs.exists,
            fsync: (target) =>
              target === path.dirname(original) && ++directorySyncs === 3
                ? Effect.fail(PlatformError.badArgument({ description: 'commit fsync failed', method: 'sync', module: 'FileSystem' }))
                : fsync(target),
            remove: fs.remove,
            rename: fs.rename,
          },
          outputFiles: ['movie.mp4'],
        })
      )

      expect(Result.isFailure(result) && result.failure).toBeInstanceOf(FileAccessError)
      expect(yield* fs.readFileString(original)).toBe('original')
      expect(yield* fs.exists(destination)).toBeFalse()
      expect((yield* fs.readDirectory(directory)).some((entry) => entry.includes('autoscan-stage'))).toBeFalse()
    }).pipe(provideTest)
  )

  it.live('waits for an interrupted staging copy to close before removing its partial file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const outputDirectory = path.join(directory, 'output')
      directories.push(directory)
      yield* fs.makeDirectory(outputDirectory)
      const original = path.join(directory, 'movie.mkv')
      const source = path.join(outputDirectory, 'movie.mp4')
      yield* fs.writeFileString(original, 'original')
      yield* fs.writeFileString(source, 'new')
      const events: string[] = []
      const started = yield* Latch.make()

      const fiber = yield* Effect.forkChild(
        replaceOutputs(original, outputDirectory, {
          operations: {
            copyFile: (_source, destination) =>
              fs.writeFileString(destination, 'partial').pipe(
                Effect.andThen(started.open),
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => Effect.sync(() => events.push('closed')))
              ),
            exists: fs.exists,
            fsync: fsyncWith(fs),
            remove: (target, options) =>
              Effect.suspend(() => {
                if (target.includes('autoscan-stage')) {
                  events.push('cleanup')
                }
                return fs.remove(target, options)
              }),
            rename: () => Effect.sync(() => events.push('rename')),
          },
          outputFiles: ['movie.mp4'],
        })
      )

      yield* started.await
      fiber.interruptUnsafe()
      const exit = yield* Fiber.await(fiber)

      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
      expect(events).toEqual(['closed', 'cleanup'])
      expect(yield* fs.readFileString(original)).toBe('original')
      expect(yield* fs.readFileString(source)).toBe('new')
      expect((yield* fs.readDirectory(directory)).some((entry) => entry.includes('autoscan-stage'))).toBeFalse()
    }).pipe(provideTest)
  )
})
