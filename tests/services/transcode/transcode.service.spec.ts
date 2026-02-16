import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect } from '@effect/vitest'
import { Effect, Layer, Schedule } from 'effect'

import { FfmpegClient } from '@/integrations/ffmpeg.service'
import type { FfprobeStream } from '@/schemas/ffmpeg'
import { TranscodeService } from '@/services/transcode/transcode.service'

import { testWithTestDir, videosPath } from '../../config'
import { MockPlexLayer } from '../../mocks/plex.mock'
import { MockRadarrLayer } from '../../mocks/radarr.mock'
import { MockSonarrLayer } from '../../mocks/sonarr.mock'

const TestLayer = TranscodeService.DefaultWithoutDependencies.pipe(
  Layer.provide(Layer.mergeAll(FfmpegClient.Default, MockPlexLayer, MockRadarrLayer, MockSonarrLayer))
)

interface FileDataset {
  filename: string
  outputStreams: {
    codecName: string
    codecType: string
    index: number
    language?: NonNullable<FfprobeStream['tags']>['language']
  }[]
  shouldExecute: boolean
  title: string
}

const dataset: FileDataset[] = [
  {
    filename: 'test_audio_dts.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: true,
    title: 'should convert dts to aac',
  },
  {
    filename: 'test_correct_file.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: true,
    title: 'should convert format to mp4',
  },
  {
    filename: 'test_audio_aac_dts.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: true,
    title: 'should keep only wanted tracks',
  },
  {
    filename: 'test_correct_file.mp4',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: false,
    title: 'should not transcode already correct file',
  },
  {
    filename: 'test_audio_spa.mkv',
    outputStreams: [],
    shouldExecute: false,
    title: 'should not transcode if no audio stream would be kept in output',
  },
]

describe('Transcode', () => {
  testWithTestDir.for(dataset)('$title', ({ filename, outputStreams, shouldExecute }, { testDir }) => {
    copyFileSync(join(videosPath, filename), join(testDir, filename))

    return Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* TranscodeService
        const executed = yield* service.transcodeFile(join(testDir, filename), 'test', 'en', 'movie')

        expect(executed).toBe(shouldExecute)

        if (!executed) {
          expect(existsSync(join(testDir, filename))).toBe(true)
          return
        }

        yield* service.getStatus().pipe(
          Effect.filterOrFail(
            (status) => !status.isProcessing && status.queueLength === 0,
            () => 'queue not empty'
          ),
          Effect.retry(Schedule.spaced('100 millis'))
        )

        const outputFileName = filename.replace('.mkv', '.mp4')
        expect(existsSync(join(testDir, outputFileName))).toBe(true)
        expect(existsSync(join(testDir, outputFileName.replace('.mp4', '.en.srt')))).toBe(true)

        if (outputFileName !== filename) {
          expect(existsSync(join(testDir, filename))).toBe(false)
        }

        const ffmpeg = yield* FfmpegClient
        const streams = yield* ffmpeg.ffprobe(join(testDir, outputFileName))

        for (const stream of outputStreams) {
          expect(streams[stream.index]?.codec_type).toBe(stream.codecType)
          expect(streams[stream.index]?.codec_name).toBe(stream.codecName)
          if (stream.language) {
            expect(streams[stream.index]?.tags?.language).toBe(stream.language)
          }
        }
      }).pipe(Effect.provide(Layer.mergeAll(TestLayer, FfmpegClient.Default)))
    )
  })
})
