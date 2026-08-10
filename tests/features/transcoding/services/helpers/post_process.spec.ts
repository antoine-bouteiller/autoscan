import { afterEach, describe, expect, test } from 'bun:test'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { copyFile, open, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { runTest } from '@tests/effect'
import { makeTestDir, videosPath } from '@tests/utils'
import { Cause, Effect, Exit, Fiber, Result } from 'effect'

import env from '@/config/env'
import { FileAccessError } from '@/features/transcoding/errors'
import { handlePostTranscode, replaceOutputs } from '@/features/transcoding/services/helpers/post_process'

const directories: string[] = []

const fsync = async (path: string) => {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('handlePostTranscode', () => {
  test('does nothing when no transcode output exists', async () => {
    const directory = makeTestDir()
    directories.push(directory)
    expect(
      await runTest(handlePostTranscode({ filePath: join(directory, 'missing.mkv'), mediaTitle: 'Missing', mediaType: 'movie' }))
    ).toBeUndefined()
  })

  test('durably replaces the original with validated output', async () => {
    const directory = makeTestDir()
    directories.push(directory)
    const original = join(directory, 'movie.mkv')
    writeFileSync(original, 'original')

    const outputDirectory = join(env.TRANSCODE_PATH, basename(original, '.mkv'))
    directories.push(outputDirectory)
    mkdirSync(outputDirectory, { recursive: true })
    copyFileSync(join(videosPath, 'test_correct_file.mp4'), join(outputDirectory, 'movie.mp4'))

    await runTest(handlePostTranscode({ filePath: original, mediaTitle: 'Movie', mediaType: 'movie' }))

    expect(existsSync(original)).toBeFalse()
    expect(existsSync(join(directory, 'movie.mp4'))).toBeTrue()
    expect(readFileSync(join(directory, 'movie.mp4')).byteLength).toBeGreaterThan(0)
    expect(existsSync(outputDirectory)).toBeFalse()
  })

  test('replaces a colliding destination without leaving backups', async () => {
    const directory = makeTestDir()
    directories.push(directory)
    const original = join(directory, 'movie.mkv')
    const destination = join(directory, 'movie.mp4')
    writeFileSync(original, 'original')
    writeFileSync(destination, 'collision')

    const outputDirectory = join(env.TRANSCODE_PATH, basename(original, '.mkv'))
    directories.push(outputDirectory)
    mkdirSync(outputDirectory, { recursive: true })
    copyFileSync(join(videosPath, 'test_correct_file.mp4'), join(outputDirectory, 'movie.mp4'))

    await runTest(handlePostTranscode({ filePath: original, mediaTitle: 'Movie', mediaType: 'movie' }))
    expect(readFileSync(destination).toString()).not.toBe('collision')
    expect(readdirSync(directory).some((path) => path.includes('autoscan-backup'))).toBeFalse()
  })

  test('keeps the durable installation when backup cleanup fails', async () => {
    const directory = makeTestDir()
    const outputDirectory = join(directory, 'output')
    directories.push(directory)
    mkdirSync(outputDirectory)
    const original = join(directory, 'movie.mkv')
    const destination = join(directory, 'movie.mp4')
    writeFileSync(original, 'original')
    writeFileSync(join(outputDirectory, 'movie.mp4'), 'new')

    const result = await Effect.runPromise(
      Effect.result(
        replaceOutputs(original, outputDirectory, {
          operations: {
            copyFile: (source, copyDestination) => copyFile(source, copyDestination),
            exists: existsSync,
            fsync,
            remove: async (path, options) => {
              if (String(path).includes('autoscan-backup')) {
                throw new Error('cleanup failed')
              }
              await rm(path, options)
            },
            rename,
          },
          outputFiles: ['movie.mp4'],
        })
      )
    )

    expect(Result.isSuccess(result) && result.success).toBeInstanceOf(FileAccessError)
    expect(readFileSync(destination, 'utf8')).toBe('new')
    expect(readdirSync(directory).some((path) => path.includes('autoscan-backup'))).toBeTrue()
  })

  test('rolls back an installed output when the commit fsync fails', async () => {
    const directory = makeTestDir()
    const outputDirectory = join(directory, 'output')
    directories.push(directory)
    mkdirSync(outputDirectory)
    const original = join(directory, 'movie.mkv')
    const destination = join(directory, 'movie.mp4')
    writeFileSync(original, 'original')
    writeFileSync(join(outputDirectory, 'movie.mp4'), 'new')
    let directorySyncs = 0

    const result = await Effect.runPromise(
      Effect.result(
        replaceOutputs(original, outputDirectory, {
          operations: {
            copyFile: (source, copyDestination) => copyFile(source, copyDestination),
            exists: existsSync,
            fsync: async (path) => {
              if (path === dirname(original) && ++directorySyncs === 3) {
                throw new Error('commit fsync failed')
              }
              await fsync(path)
            },
            remove: rm,
            rename,
          },
          outputFiles: ['movie.mp4'],
        })
      )
    )

    expect(Result.isFailure(result) && result.failure).toBeInstanceOf(FileAccessError)
    expect(readFileSync(original, 'utf8')).toBe('original')
    expect(existsSync(destination)).toBeFalse()
    expect(readdirSync(directory).some((path) => path.includes('autoscan-stage'))).toBeFalse()
  })

  test('waits for an interrupted staging copy to close before removing its partial file', async () => {
    const directory = makeTestDir()
    const outputDirectory = join(directory, 'output')
    directories.push(directory)
    mkdirSync(outputDirectory)
    const original = join(directory, 'movie.mkv')
    const source = join(outputDirectory, 'movie.mp4')
    writeFileSync(original, 'original')
    writeFileSync(source, 'new')
    const events: string[] = []
    const { promise: started, resolve: markStarted } = Promise.withResolvers<void>()

    const fiber = Effect.runFork(
      replaceOutputs(original, outputDirectory, {
        operations: {
          copyFile: async (_source, destination, signal) => {
            writeFileSync(destination, 'partial')
            markStarted()
            await new Promise<void>((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => {
                  events.push('closed')
                  reject(signal.reason)
                },
                { once: true }
              )
            })
          },
          exists: existsSync,
          fsync,
          remove: async (path, options) => {
            if (String(path).includes('autoscan-stage')) {
              events.push('cleanup')
            }
            await rm(path, options)
          },
          rename: async () => {
            events.push('rename')
          },
        },
        outputFiles: ['movie.mp4'],
      })
    )

    await started
    fiber.interruptUnsafe()
    const exit = await Effect.runPromise(Fiber.await(fiber))

    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
    expect(events).toEqual(['closed', 'cleanup'])
    expect(readFileSync(original, 'utf8')).toBe('original')
    expect(readFileSync(source, 'utf8')).toBe('new')
    expect(readdirSync(directory).some((path) => path.includes('autoscan-stage'))).toBeFalse()
  })
})
