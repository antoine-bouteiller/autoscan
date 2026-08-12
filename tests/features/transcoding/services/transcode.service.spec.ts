import { beforeEach, describe, expect, test } from 'bun:test'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { BunServices } from '@effect/platform-bun'
import { runTest } from '@tests/effect'
import { makeTestDir, refreshSectionsMock, videosPath } from '@tests/utils'
import { Effect } from 'effect'

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

  test('probes media streams', async () => {
    const result = await Effect.runPromise(Effect.provide(new FfmpegClient().ffprobe(join(videosPath, 'test_audio_dts.mkv')), BunServices.layer))
    expect(result.streams.some((stream) => stream.codec_type === 'audio')).toBeTrue()
  })

  test('queues a file requiring conversion', async () => {
    const directory = makeTestDir()
    const file = join(directory, 'test_audio_dts.mkv')
    copyFileSync(join(videosPath, 'test_audio_dts.mkv'), file)
    try {
      expect(await runTest(transcodeAndWait(file))).toBeTrue()
      expect(readdirSync(directory).some((name) => name.endsWith('.mp4'))).toBeTrue()
    } finally {
      rmSync(directory, { recursive: true })
    }
  }, 15_000)

  test('does not queue an already-correct file', async () => {
    const directory = makeTestDir()
    const source = join(videosPath, 'test_correct_file.mp4')
    const file = join(directory, basename(source))
    copyFileSync(source, file)
    try {
      expect(await runTest(transcodeAndWait(file))).toBeFalse()
      expect(existsSync(file)).toBeTrue()
    } finally {
      rmSync(directory, { recursive: true })
    }
  })

  test('refreshes Plex for a missing file', async () => {
    expect(await runTest(transcodeFile({ file: '/missing/file.mkv', mediaTitle: 'missing', mediaType: 'movie', originalLanguage: 'en' }))).toBeFalse()
    expect(refreshSectionsMock).toHaveBeenCalledWith('/missing/file.mkv', 'movie')
  })

  test('refuses to reuse a preserved recovery directory', async () => {
    const directory = makeTestDir()
    const file = join(directory, 'test_audio_dts.mkv')
    const outputDirectory = join(env.TRANSCODE_PATH, 'test_audio_dts')
    copyFileSync(join(videosPath, 'test_audio_dts.mkv'), file)
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, '.autoscan-recovery.json'), '{}')
    writeFileSync(join(outputDirectory, 'stale.srt'), 'stale')
    try {
      expect(await runTest(transcodeAndWait(file))).toBeTrue()
      expect(existsSync(join(outputDirectory, '.autoscan-recovery.json'))).toBeTrue()
      expect(existsSync(join(outputDirectory, 'stale.srt'))).toBeTrue()
    } finally {
      rmSync(directory, { recursive: true })
      rmSync(outputDirectory, { force: true, recursive: true })
    }
  })

  test('rejects new jobs after intake stops', async () => {
    const accepted = await runTest(
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
})
