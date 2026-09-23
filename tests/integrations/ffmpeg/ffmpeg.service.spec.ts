import { fileURLToPath } from 'node:url'

import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { Deferred, Effect, Fiber, FileSystem, Schema } from 'effect'

import { FileNotFoundError } from '@/features/transcoding/errors'
import { FfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { readSpeechActivity } from '@/integrations/ffmpeg/speech_activity'
import { CommandExecutionError } from '@/shared/errors/command'
import { ValidationError } from '@/shared/errors/validation'
import { spawn } from '@/shared/utils/command'

const importPath = (specifier: string) => Schema.encodeEffect(Schema.fromJsonString(Schema.String))(fileURLToPath(import.meta.resolve(specifier)))
const fixture = `${import.meta.dir}/fixtures/speech.ogg`
const client = new FfmpegClient()
const run = <Success, Failure>(effect: Effect.Effect<Success, Failure, BunServices.BunServices>) => Effect.provide(effect, BunServices.layer)

// These tests exercise actual local FFmpeg and the pinned Silero model, not a detector mock.
describe('FfmpegClient speech activity', () => {
  it.live('recognizes speech and returns merged, bounded intervals', () =>
    Effect.gen(function* () {
      const result = yield* client.speechActivity(fixture, 0)
      expect(result.duration).toBeGreaterThan(4)
      // Independent official Silero OnnxWrapper inference, threshold 0.5, without segment padding.
      expect(result.intervals).toEqual([
        [0.032, 2.688],
        [2.88, 6.4063125],
      ])
      expect(yield* client.speechActivity(fixture, 0)).toEqual(result)
      let previousEnd = -1
      for (const [start, end] of result.intervals) {
        expect(start).toBeGreaterThan(previousEnd)
        expect(end).toBeGreaterThan(start)
        expect(end).toBeLessThanOrEqual(result.duration)
        previousEnd = end
      }
    }).pipe(run)
  )

  it.live('maps only the requested audio stream and downmixes stereo', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const input = `${directory}/two-streams.mkv`
      yield* spawn({
        args: [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=16000:cl=stereo',
          '-i',
          fixture,
          '-map',
          '0:a',
          '-map',
          '1:a',
          '-ac',
          '2',
          '-c:a',
          'pcm_s16le',
          '-t',
          '7',
          input,
        ],
        command: 'ffmpeg',
      })
      const silence = yield* client.speechActivity(input, 0)
      const speech = yield* client.speechActivity(input, 1)
      expect(silence.intervals).toEqual([])
      expect(silence.duration).toBeCloseTo(7, 2)
      expect(speech.intervals.length).toBeGreaterThan(0)
    }).pipe(Effect.scoped, run)
  )

  it.live('keeps delayed audio on the media timeline', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const input = `${directory}/delayed.mkv`
      yield* spawn({
        args: [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=size=16x16:rate=1',
          '-itsoffset',
          '2',
          '-i',
          fixture,
          '-map',
          '0:v',
          '-map',
          '1:a',
          '-c:a',
          'pcm_s16le',
          '-c:v',
          'ffv1',
          '-t',
          '10',
          input,
        ],
        command: 'ffmpeg',
      })
      const result = yield* client.speechActivity(input, 1)
      expect(result.intervals.length).toBeGreaterThan(0)
      expect(result.intervals[0]?.[0]).toBeGreaterThanOrEqual(1.95)
    }).pipe(Effect.scoped, run)
  )

  it.live('rejects missing files and invalid or non-audio streams', () =>
    Effect.gen(function* () {
      expect(yield* Effect.flip(client.speechActivity('/missing/autoscan-media.ogg', 0))).toBeInstanceOf(FileNotFoundError)
      for (const index of [-1, 0.5, Number.NaN, 99]) {
        expect(yield* Effect.flip(client.speechActivity(fixture, index))).toBeInstanceOf(ValidationError)
      }
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const input = `${directory}/video.mkv`
      yield* spawn({ args: ['-y', '-f', 'lavfi', '-i', 'color=size=16x16:rate=1', '-t', '1', '-c:v', 'ffv1', input], command: 'ffmpeg' })
      expect(yield* Effect.flip(client.speechActivity(input, 0))).toBeInstanceOf(ValidationError)
    }).pipe(Effect.scoped, run)
  )

  it.live('rejects untrustworthy media durations before decoding', () =>
    Effect.gen(function* () {
      const invalid = new FfmpegClient()
      for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        invalid.ffprobe = () => Effect.succeed({ duration, streams: [{ codec_type: 'audio', index: 0 }] })
        expect(yield* Effect.flip(invalid.speechActivity(fixture, 0))).toBeInstanceOf(ValidationError)
      }
    }).pipe(run)
  )

  it.live('cleans the scoped PCM directory after success and decoder failure', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directories: string[] = []
      const tracked = {
        ...fs,
        makeTempDirectoryScoped: (options?: Parameters<typeof fs.makeTempDirectoryScoped>[0]) =>
          fs.makeTempDirectoryScoped(options).pipe(Effect.tap((directory) => Effect.sync(() => directories.push(directory)))),
      }
      yield* client.speechActivity(fixture, 0).pipe(Effect.provideService(FileSystem.FileSystem, tracked))
      const broken = new FfmpegClient()
      broken.ffprobe = () => Effect.succeed({ duration: 1, streams: [{ codec_type: 'audio', index: 0 }] })
      const error = yield* broken
        .speechActivity('/missing/decoder-input.ogg', 0)
        .pipe(Effect.provideService(FileSystem.FileSystem, tracked), Effect.flip)
      expect(error).toBeInstanceOf(CommandExecutionError)
      expect(directories).toHaveLength(2)
      for (const directory of directories) {
        expect(yield* fs.exists(directory)).toBeFalse()
      }
    }).pipe(run)
  )

  it.live('reports model-loading failure instead of returning silence', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const brokenModel = {
        ...fs,
        readFile: (path: string) => (path.endsWith('.onnx') ? Effect.succeed(new Uint8Array()) : fs.readFile(path)),
      }
      const error = yield* client.speechActivity(fixture, 0).pipe(Effect.provideService(FileSystem.FileSystem, brokenModel), Effect.flip)
      expect(error).toBeInstanceOf(ValidationError)
    }).pipe(run)
  )

  it.live('embeds Silero and its WASM runtime in a standalone executable without network access', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const source = `${directory}/speech_smoke.ts`
      const binary = `${directory}/speech_smoke`
      yield* fs.writeFileString(
        source,
        `
import { BunServices } from ${yield* importPath('@effect/platform-bun')}
import { Effect } from ${yield* importPath('effect')}
import { FfmpegClient } from ${yield* importPath('@/integrations/ffmpeg/ffmpeg.service')}
import model from ${yield* importPath('@/integrations/ffmpeg/models/silero_vad.onnx')} with { type: 'file' }
globalThis.fetch = () => { throw new Error('Network access forbidden') }
const speech = await Effect.runPromise(new FfmpegClient().speechActivity(process.argv[2], 0).pipe(Effect.provide(BunServices.layer)))
console.log(JSON.stringify({ embedded: model.startsWith('/$bunfs/'), speech }))
`
      )
      yield* spawn({ args: ['build', '--compile', source, '--outfile', binary], command: process.execPath, timeout: 120_000 })
      const output = yield* spawn({ args: [fixture], command: binary, cwd: directory, timeout: 30_000 })
      expect(yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(output)).toMatchObject({
        embedded: true,
        speech: {
          duration: 6.4063125,
          intervals: [
            [0.032, 2.688],
            [2.88, 6.4063125],
          ],
        },
      })
    }).pipe(Effect.scoped, run)
  )

  it.live('releases PCM and its directory when processing is interrupted', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const reading = yield* Deferred.make<void>()
      const directories: string[] = []
      const tracked = {
        ...fs,
        makeTempDirectoryScoped: (options?: Parameters<typeof fs.makeTempDirectoryScoped>[0]) =>
          fs.makeTempDirectoryScoped(options).pipe(Effect.tap((directory) => Effect.sync(() => directories.push(directory)))),
        open: (...args: Parameters<typeof fs.open>) =>
          fs.open(...args).pipe(
            Effect.map((file) => ({
              ...file,
              read: () => Deferred.succeed(reading, undefined).pipe(Effect.andThen(Effect.never)),
            }))
          ),
      }
      const fiber = yield* client.speechActivity(fixture, 0).pipe(Effect.provideService(FileSystem.FileSystem, tracked), Effect.forkChild)
      yield* Deferred.await(reading)
      yield* Fiber.interrupt(fiber)
      expect(directories).toHaveLength(1)
      for (const directory of directories) {
        expect(yield* fs.exists(directory)).toBeFalse()
      }
    }).pipe(Effect.scoped, run)
  )
})

describe('PCM speech reader', () => {
  it.live('preserves exact sample duration across chunks and a partial final frame', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const input = `${directory}/silence.pcm`
      const samples = 512 * 129 + 17
      yield* fs.writeFile(input, new Uint8Array(samples * 2))
      expect(yield* readSpeechActivity(input)).toEqual({ duration: samples / 16_000, intervals: [] })
      const shortReads = {
        ...fs,
        open: (...args: Parameters<typeof fs.open>) =>
          fs.open(...args).pipe(Effect.map((file) => ({ ...file, read: (buffer: Uint8Array) => file.read(buffer.subarray(0, 997)) }))),
      }
      expect(yield* readSpeechActivity(input).pipe(Effect.provideService(FileSystem.FileSystem, shortReads))).toEqual({
        duration: samples / 16_000,
        intervals: [],
      })
    }).pipe(Effect.scoped, run)
  )

  it.live('rejects empty and malformed PCM instead of treating errors as silence', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const input = `${directory}/invalid.pcm`
      for (const length of [0, 1, 1025]) {
        yield* fs.writeFile(input, new Uint8Array(length))
        expect(yield* Effect.flip(readSpeechActivity(input))).toBeInstanceOf(ValidationError)
      }
    }).pipe(Effect.scoped, run)
  )
})
