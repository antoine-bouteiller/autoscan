import { spyOn } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { EnvTestLayer } from '@tests/env'
import { describe, expect, it } from '@tests/it'
import { Cause, Deferred, Effect, Fiber, FileSystem, Layer } from 'effect'
import { InferenceSession } from 'onnxruntime-web/wasm'

import { makeFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'

import known from '../../fixtures/speech/known.json'

const fixture = new URL('../../fixtures/speech/speech.mka', import.meta.url).pathname
const services = Layer.mergeAll(BunServices.layer, EnvTestLayer)
const hasSessionPrototype = (factory: typeof InferenceSession): factory is typeof InferenceSession & { prototype: InferenceSession } =>
  'prototype' in factory
const trackDirectories = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const directories: string[] = []
  return {
    directories,
    fs,
    service: {
      ...fs,
      makeTempDirectoryScoped: (options: Parameters<typeof fs.makeTempDirectoryScoped>[0]) =>
        fs.makeTempDirectoryScoped(options).pipe(Effect.tap((directory) => Effect.sync(() => directories.push(directory)))),
    },
  }
})

describe('sampleSpeech', () => {
  it.live(
    '[VC-17] detects generated speech in media seconds within 0.3 seconds',
    () =>
      Effect.gen(function* () {
        const { directories, fs, service } = yield* trackDirectories
        const client = yield* makeFfmpegClient.pipe(Effect.provideService(FileSystem.FileSystem, service))
        const result = yield* client.sampleSpeech(fixture, known.speechStream, known.windows)
        const speech = result.flatMap((window) => window.speech)
        expect(result.map(({ start, duration }) => ({ duration, start }))).toEqual(known.windows)
        expect(speech).toHaveLength(known.speech.length)
        for (const [index, interval] of speech.entries()) {
          expect(Math.abs(interval[0] - known.speech[index][0])).toBeLessThanOrEqual(0.3)
          expect(Math.abs(interval[1] - known.speech[index][1])).toBeLessThanOrEqual(0.3)
        }
        expect(result[2].speech).toEqual([])
        expect(directories).toHaveLength(1)
        expect(yield* fs.exists(directories[0])).toBeFalse()
      }).pipe(Effect.provide(services)),
    15_000
  )

  it.live('[VC-17] selects the requested audio stream rather than the first one', () =>
    Effect.gen(function* () {
      const client = yield* makeFfmpegClient
      const result = yield* client.sampleSpeech(fixture, known.silentStream, known.windows)
      expect(result.map((window) => window.speech)).toEqual([[], [], []])
    }).pipe(Effect.provide(services))
  )

  it.live('[VC-17] is deterministic and resets recurrent state and context between windows', () =>
    Effect.gen(function* () {
      const client = yield* makeFfmpegClient
      const combined = yield* client.sampleSpeech(fixture, known.speechStream, known.windows)
      expect(yield* client.sampleSpeech(fixture, known.speechStream, known.windows)).toEqual(combined)
      expect(yield* client.sampleSpeech(fixture, known.speechStream, [known.windows[1]])).toEqual([combined[1]])
      const overlapping = { duration: 0.8, start: 1.5 }
      const alone = yield* client.sampleSpeech(fixture, known.speechStream, [overlapping])
      const afterSpeech = yield* client.sampleSpeech(fixture, known.speechStream, [overlapping, overlapping])
      expect(afterSpeech).toEqual([alone[0], alone[0]])
    }).pipe(Effect.provide(services))
  )

  it.live('clips padded speech to a partial final frame and discards speech shorter than 250 ms', () =>
    Effect.gen(function* () {
      const client = yield* makeFfmpegClient
      const window = { duration: 0.803, start: 1.5 }
      const result = yield* client.sampleSpeech(fixture, 0, [window, { duration: 0.1, start: 1.5 }])
      expect(result[0].speech).toHaveLength(1)
      const [[start, end]] = result[0].speech
      expect(start).toBeGreaterThanOrEqual(window.start)
      expect(end).toBeCloseTo(window.start + window.duration, 5)
      expect(result[1].speech).toEqual([])
    }).pipe(Effect.provide(services))
  )

  it.live('returns no windows without attempting to decode input', () =>
    Effect.gen(function* () {
      const client = yield* makeFfmpegClient
      expect(yield* client.sampleSpeech('/missing/media.mka', 0, [])).toEqual([])
    }).pipe(Effect.provide(services))
  )

  it.live('rejects a missing input with FileNotFoundError', () =>
    Effect.gen(function* () {
      const client = yield* makeFfmpegClient
      expect(yield* Effect.flip(client.sampleSpeech('/missing/media.mka', 0, known.windows))).toMatchObject({
        _tag: 'FileNotFoundError',
        filePath: '/missing/media.mka',
      })
    }).pipe(Effect.provide(services))
  )

  it.live('[VC-17] removes its temporary directory when ffmpeg rejects the stream', () =>
    Effect.gen(function* () {
      const { directories, fs, service } = yield* trackDirectories
      const client = yield* makeFfmpegClient.pipe(Effect.provideService(FileSystem.FileSystem, service))
      expect(yield* Effect.flip(client.sampleSpeech(fixture, 99, known.windows))).toMatchObject({ _tag: 'CommandExecutionError' })
      expect(directories).toHaveLength(1)
      expect(yield* fs.exists(directories[0])).toBeFalse()
    }).pipe(Effect.provide(services))
  )

  it.live('preserves filesystem errors and cleans up when reading decoded PCM fails', () =>
    Effect.gen(function* () {
      const { directories, fs, service } = yield* trackDirectories
      const client = yield* makeFfmpegClient.pipe(
        Effect.provideService(FileSystem.FileSystem, { ...service, readFile: (path) => fs.readFile(`${path}.missing`) })
      )
      expect(yield* Effect.flip(client.sampleSpeech(fixture, 0, known.windows))).toMatchObject({ _tag: 'PlatformError' })
      expect(directories).toHaveLength(1)
      expect(yield* fs.exists(directories[0])).toBeFalse()
    }).pipe(Effect.provide(services))
  )

  it.live('reports SpeechActivityError and cleans up when ONNX inference fails', () =>
    Effect.gen(function* () {
      const { directories, fs, service } = yield* trackDirectories
      const client = yield* makeFfmpegClient.pipe(Effect.provideService(FileSystem.FileSystem, service))
      const cause = new Error('WASM inference unavailable')
      if (hasSessionPrototype(InferenceSession)) {
        spyOn(InferenceSession.prototype, 'run').mockRejectedValueOnce(cause)
      }
      expect(yield* Effect.flip(client.sampleSpeech(fixture, 0, known.windows))).toMatchObject({ _tag: 'SpeechActivityError', cause })
      expect(directories).toHaveLength(1)
      expect(yield* fs.exists(directories[0])).toBeFalse()
    }).pipe(Effect.provide(services))
  )

  it.live('[VC-17] propagates interruption and removes partially decoded temporary files', () =>
    Effect.gen(function* () {
      const { directories, fs, service } = yield* trackDirectories
      const ready = yield* Deferred.make<void>()
      const client = yield* makeFfmpegClient.pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...service,
          readFile: (path) =>
            fs.readFile(path).pipe(
              Effect.tap(() => Deferred.succeed(ready, undefined)),
              Effect.andThen(Effect.never)
            ),
        })
      )
      const fiber = yield* Effect.forkChild(client.sampleSpeech(fixture, 0, known.windows))
      yield* Deferred.await(ready)
      expect(directories).toHaveLength(1)
      expect(yield* fs.exists(directories[0])).toBeTrue()
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure') {
        expect(Cause.hasInterrupts(exit.cause)).toBeTrue()
      }
      expect(yield* fs.exists(directories[0])).toBeFalse()
    }).pipe(Effect.scoped, Effect.provide(services))
  )
})
