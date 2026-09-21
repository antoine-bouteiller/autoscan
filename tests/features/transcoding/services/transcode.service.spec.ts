import { beforeEach, spyOn } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { testEnv as env } from '@tests/env'
import { describe, expect, it } from '@tests/it'
import { makeTestDir, MockTelegramClient, refreshSectionsMock, sendMessageMock, videosPath } from '@tests/utils'
import { CryptoHasher } from 'bun'
import { Cause, Effect, FileSystem, Path } from 'effect'

import { TranscodeQueue } from '@/core/runtime.service'
import { transcodeScans } from '@/database/schema'
import { TRANSCODE_SCAN_VERSION } from '@/features/transcoding/constants'
import { FileNotFoundError } from '@/features/transcoding/errors'
import { transcodeFile } from '@/features/transcoding/services/transcode.service'
import { type IFfmpegClient, FfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'

const cleanScans = () => Effect.promise(() => db.delete(transcodeScans))
const passedProbe = {
  duration: 100,
  streams: [
    { codec_name: 'h264', codec_type: 'video' },
    { codec_name: 'aac', codec_type: 'audio', tags: { language: 'en' } },
  ],
} satisfies { duration: number; streams: FFprobeStream[] }
const ffmpeg = (ffprobe: IFfmpegClient['ffprobe'] = () => Effect.succeed(passedProbe)): IFfmpegClient => ({
  execute: (..._command) => Effect.succeed(''),
  executeFfmpeg: (_params) => Effect.succeed(''),
  ffprobe,
})

const transcode = (file: string, originalLanguage: 'en' | 'fr' = 'en') =>
  transcodeFile({ file, mediaTitle: 'Movie', mediaType: 'movie', originalLanguage })

const transcodeAndWait = (file: string) =>
  Effect.gen(function* () {
    const queued = yield* transcodeFile({ file, mediaTitle: 'test', mediaType: 'movie', originalLanguage: 'en' })
    const queue = yield* TranscodeQueue
    yield* queue.awaitIdle
    return queued
  })

describe('transcodeFile', () => {
  beforeEach(() => {
    refreshSectionsMock.mockClear()
    sendMessageMock.mockReset().mockResolvedValue(100)
    return Effect.runPromise(cleanScans())
  })

  it.live('persists passed paths across contexts without hashing, but checks renamed paths and matching basenames separately', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mp4`
      const renamed = `${directory}/Renamed.mp4`
      const other = `${directory}/Other/Movie.mp4`
      yield* fs.makeDirectory(`${directory}/Other`)
      yield* fs.writeFileString(other, 'unchanged')
      yield* fs.writeFileString(file, 'unchanged')
      const hashSpy = spyOn(CryptoHasher.prototype, 'update')
      let probes = 0
      const client = ffmpeg(() => Effect.sync(() => ++probes).pipe(Effect.as(passedProbe)))

      expect(yield* provideTest(transcode(file), { ffmpeg: client })).toBeFalse()
      yield* fs.writeFileString(file, 'replaced at the same path')
      expect(yield* provideTest(transcode(file), { ffmpeg: client })).toBeFalse()
      expect(probes).toBe(1)
      yield* fs.rename(file, renamed)
      expect(yield* provideTest(transcode(renamed), { ffmpeg: client })).toBeFalse()
      expect(yield* provideTest(transcode(other), { ffmpeg: client })).toBeFalse()
      expect(probes).toBe(3)
      expect(hashSpy).not.toHaveBeenCalled()
      hashSpy.mockRestore()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('invalidates passed scans for path, language, and version', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const mp4 = `${directory}/Movie.mp4`
      const mkv = `${directory}/Movie.mkv`
      yield* fs.writeFileString(mp4, 'same-content')
      let probes = 0
      const client = ffmpeg(() => Effect.sync(() => ++probes).pipe(Effect.as(passedProbe)))
      yield* provideTest(transcode(mp4), { ffmpeg: client })
      yield* fs.writeFileString(mkv, 'same-content')
      yield* provideTest(transcode(mkv), { ffmpeg: client })
      yield* provideTest(transcode(mp4, 'fr'), { ffmpeg: client })

      yield* Effect.promise(() => db.update(transcodeScans).set({ scanVersion: TRANSCODE_SCAN_VERSION - 1 }))
      yield* provideTest(transcode(mp4), { ffmpeg: client })
      expect(probes).toBe(4)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('continues analysis after registry failures and retries unrecorded passes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mp4`
      yield* fs.writeFileString(file, 'content')
      let probes = 0
      const client = ffmpeg(() => Effect.sync(() => ++probes).pipe(Effect.as(passedProbe)))
      spyOn(db, 'select').mockImplementationOnce(() => {
        throw new Error('registry read failed')
      })
      spyOn(db, 'insert').mockImplementationOnce(() => {
        throw new Error('registry write failed')
      })
      expect(yield* provideTest(transcode(file), { ffmpeg: client })).toBeFalse()
      expect(probes).toBe(1)
      expect(yield* Effect.promise(() => db.select().from(transcodeScans))).toHaveLength(0)
      expect(yield* provideTest(transcode(file), { ffmpeg: client })).toBeFalse()
      expect(probes).toBe(2)
      expect(yield* Effect.promise(() => db.select().from(transcodeScans))).toHaveLength(1)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('does not persist failed, queued, or rejected work', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      yield* fs.writeFileString(file, 'content')
      expect(yield* provideTest(transcode(file), { ffmpeg: ffmpeg(() => Effect.die('probe failed')) })).toBeFalse()
      expect(yield* provideTest(transcode(file), { ffmpeg: ffmpeg() })).toBeTrue()
      expect(
        yield* provideTest(
          Effect.gen(function* () {
            const queue = yield* TranscodeQueue
            yield* queue.stopIntake
            return yield* transcode(file)
          }),
          { ffmpeg: ffmpeg() }
        )
      ).toBeFalse()
      expect(yield* Effect.promise(() => db.select().from(transcodeScans))).toHaveLength(0)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('does not persist scans when the file changes while probing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const probing = `${directory}/Probing.mp4`
      yield* fs.writeFileString(probing, 'content')
      const probeResult = yield* provideTest(transcode(probing), {
        ffmpeg: ffmpeg(() => fs.writeFileString(probing, 'changed', { flag: 'a' }).pipe(Effect.as(passedProbe))),
      })
      expect(probeResult).toBeFalse()
      expect(yield* Effect.promise(() => db.select().from(transcodeScans))).toHaveLength(0)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('notifies Telegram only for no streams kept, best-effort without swallowing interruption', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mp4`
      yield* fs.writeFileString(file, 'content')
      const noStreams = ffmpeg(() =>
        Effect.succeed({
          duration: 100,
          streams: [
            { codec_name: 'h264', codec_type: 'video' },
            { codec_name: 'aac', codec_type: 'audio', tags: { language: 'de' } },
          ] satisfies FFprobeStream[],
        })
      )
      expect(yield* provideTest(transcode(file), { ffmpeg: noStreams })).toBeFalse()
      expect(sendMessageMock).toHaveBeenCalledWith(
        env.TELEGRAM_CHAT_ID,
        'Transcoding failed: (Movie) No audio tracks would be kept after processing',
        undefined
      )
      sendMessageMock.mockClear()
      expect(
        yield* provideTest(transcode(file), {
          ffmpeg: ffmpeg(() => Effect.fail(new FileNotFoundError({ filePath: file }))),
        })
      ).toBeFalse()
      expect(sendMessageMock).not.toHaveBeenCalled()

      sendMessageMock.mockRejectedValueOnce(new Error('Telegram unavailable'))
      expect(yield* provideTest(transcode(file), { ffmpeg: noStreams })).toBeFalse()
      const telegram = new MockTelegramClient()
      spyOn(telegram, 'sendMessage').mockReturnValue(Effect.interrupt)
      const interrupted = yield* Effect.exit(provideTest(transcode(file), { ffmpeg: noStreams, telegram }))
      expect(interrupted._tag).toBe('Failure')
      if (interrupted._tag === 'Failure') {
        expect(Cause.hasInterrupts(interrupted.cause)).toBeTrue()
      }
      expect(yield* Effect.promise(() => db.select().from(transcodeScans))).toHaveLength(0)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('probes media streams', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const result = yield* new FfmpegClient().ffprobe(path.join(videosPath, 'test_audio_dts.mkv'))
      expect(result.streams.some((stream) => stream.codec_type === 'audio')).toBeTrue()
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live(
    'queues a file requiring conversion',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const directory = yield* makeTestDir
        const file = path.join(directory, 'test_audio_dts.mkv')
        yield* fs.copyFile(path.join(videosPath, 'test_audio_dts.mkv'), file)
        yield* Effect.gen(function* () {
          expect(yield* provideTest(transcodeAndWait(file))).toBeTrue()
          expect((yield* fs.readDirectory(directory)).some((name) => name.endsWith('.mp4'))).toBeTrue()
        }).pipe(Effect.ensuring(Effect.ignore(fs.remove(directory, { recursive: true }))))
      }).pipe(Effect.provide(BunServices.layer)),
    15_000
  )

  it.live('does not queue an already-correct file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const source = path.join(videosPath, 'test_correct_file.mp4')
      const file = path.join(directory, path.basename(source))
      yield* fs.copyFile(source, file)
      yield* Effect.gen(function* () {
        expect(yield* provideTest(transcodeAndWait(file))).toBeFalse()
        expect(yield* fs.exists(file)).toBeTrue()
      }).pipe(Effect.ensuring(Effect.ignore(fs.remove(directory, { recursive: true }))))
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('refreshes Plex for a missing file', () =>
    Effect.gen(function* () {
      expect(
        yield* provideTest(transcodeFile({ file: '/missing/file.mkv', mediaTitle: 'missing', mediaType: 'movie', originalLanguage: 'en' }))
      ).toBeFalse()
      expect(refreshSectionsMock).toHaveBeenCalledWith('/missing/file.mkv', 'movie')
    })
  )

  it.live('refuses to reuse a preserved recovery directory', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* makeTestDir
      const file = path.join(directory, 'test_audio_dts.mkv')
      const outputDirectory = path.join(env.TRANSCODE_PATH, 'test_audio_dts')
      yield* fs.copyFile(path.join(videosPath, 'test_audio_dts.mkv'), file)
      yield* fs.makeDirectory(outputDirectory, { recursive: true })
      yield* fs.writeFileString(path.join(outputDirectory, '.autoscan-recovery.json'), '{}')
      yield* fs.writeFileString(path.join(outputDirectory, 'stale.srt'), 'stale')
      yield* Effect.gen(function* () {
        expect(yield* provideTest(transcodeAndWait(file))).toBeTrue()
        expect(yield* fs.exists(path.join(outputDirectory, '.autoscan-recovery.json'))).toBeTrue()
        expect(yield* fs.exists(path.join(outputDirectory, 'stale.srt'))).toBeTrue()
      }).pipe(
        Effect.ensuring(
          Effect.ignore(Effect.andThen(fs.remove(directory, { recursive: true }), fs.remove(outputDirectory, { force: true, recursive: true })))
        )
      )
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('rejects new jobs after intake stops', () =>
    Effect.gen(function* () {
      const accepted = yield* provideTest(
        Effect.gen(function* () {
          const queue = yield* TranscodeQueue
          yield* queue.stopIntake
          return yield* queue.enqueue({
            command: [],
            file: '/movie.mkv',
            mediaTitle: 'Movie',
            mediaType: 'movie',
            originalLanguage: 'en',
            subtitlesToExtract: [],
          })
        })
      )
      expect(accepted).toBeFalse()
    })
  )
})
