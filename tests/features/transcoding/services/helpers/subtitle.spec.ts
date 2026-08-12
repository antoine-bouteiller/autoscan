import { copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { makeTestDir, videosPath } from '@tests/utils'
import { Effect } from 'effect'

import { isForcedSubtitle, processSubtitleStreams } from '@/features/transcoding/services/helpers/subtitle'
import { FfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type ISOCode1 } from '@/shared/types/iso_codes'

interface TestCase {
  file: string
  originalLanguage: ISOCode1
  streamToKeep: ISOCode1[]
  title: string
}

const dataset: TestCase[] = [
  {
    file: 'test_subtitle_undefined.mkv',
    originalLanguage: 'en',
    streamToKeep: ['en'],
    title: 'should tag subtitle stream with language if language is undefined - en',
  },
  {
    file: 'test_subtitle_forced.mkv',
    originalLanguage: 'en',
    streamToKeep: ['en'],
    title: 'should keep non forced en subtitle',
  },
  {
    file: 'test_subtitle_forced_undefined.mkv',
    originalLanguage: 'en',
    streamToKeep: ['en'],
    title: 'should keep undefined over forced en subtitle',
  },
  {
    file: 'test_subtitle_forced.mkv',
    originalLanguage: 'fr',
    streamToKeep: [],
    title: 'should not keep subtitle if original language is fr',
  },
]

describe('Extract subtitles', () => {
  for (const { file, originalLanguage, streamToKeep, title } of dataset) {
    it.live(title, () =>
      Effect.gen(function* () {
        const testDir = makeTestDir()
        try {
          copyFileSync(join(videosPath, file), join(testDir, file))

          const probeResult = yield* Effect.provide(new FfmpegClient().ffprobe(join(testDir, file)), BunServices.layer)
          const subtitleStreams = probeResult.streams.filter((stream) => stream.codec_type === 'subtitle')
          const streamsKepts = processSubtitleStreams(subtitleStreams, originalLanguage, 'test')

          expect(streamsKepts.length).toBe(streamToKeep.length)
        } finally {
          rmSync(testDir, { recursive: true })
        }
      })
    )
  }
})

interface ForcedTestCase {
  expected: boolean
  file: string
  title: string
}

const forcedDataset: ForcedTestCase[] = [
  {
    expected: false,
    file: 'test_audio_dts.mkv',
    title: 'should detect non-forced subtitle with enough lines and screen time',
  },
  {
    expected: true,
    file: 'test_subtitle_forced_content.mkv',
    title: 'should detect forced subtitle with low line count and screen time',
  },
]

describe('Forced subtitle detection', () => {
  for (const { expected, file, title } of forcedDataset) {
    it.live(title, () =>
      Effect.gen(function* () {
        const testDir = makeTestDir()
        try {
          copyFileSync(join(videosPath, file), join(testDir, file))

          const ffmpegClient = new FfmpegClient()
          const probeResult = yield* Effect.provide(ffmpegClient.ffprobe(join(testDir, file)), BunServices.layer)
          expect(probeResult.duration).toBeDefined()

          const srtPath = join(testDir, 'test.srt')
          yield* Effect.provide(ffmpegClient.execute('-i', join(testDir, file), '-map', '0:s:0', '-c:s', 'srt', srtPath), BunServices.layer)

          expect(isForcedSubtitle(srtPath, probeResult.duration)).toBe(expected)
        } finally {
          rmSync(testDir, { recursive: true })
        }
      })
    )
  }
})
