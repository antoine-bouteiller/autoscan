import { beforeEach } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { makeTestDir, refreshSectionsMock, videosPath } from '@tests/utils'
import { Effect, FileSystem, Path } from 'effect'

import env from '@/config/env'
import { TranscodeQueue } from '@/core/runtime.service'
import { transcodeFile } from '@/features/transcoding/services/transcode.service'
import { FfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'

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
  })

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
