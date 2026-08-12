import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { makeTestDir, videosPath } from '@tests/utils'
import { Effect, FileSystem, Path } from 'effect'

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
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const testDir = yield* makeTestDir
        yield* Effect.gen(function* () {
          yield* fs.copyFile(path.join(videosPath, file), path.join(testDir, file))

          const probeResult = yield* new FfmpegClient().ffprobe(path.join(testDir, file))
          const subtitleStreams = probeResult.streams.filter((stream) => stream.codec_type === 'subtitle')
          const streamsKepts = processSubtitleStreams(subtitleStreams, originalLanguage, 'test')

          expect(streamsKepts.length).toBe(streamToKeep.length)
        }).pipe(Effect.ensuring(Effect.ignore(fs.remove(testDir, { recursive: true }))))
      }).pipe(Effect.provide(BunServices.layer))
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
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const testDir = yield* makeTestDir
        yield* Effect.gen(function* () {
          yield* fs.copyFile(path.join(videosPath, file), path.join(testDir, file))

          const ffmpegClient = new FfmpegClient()
          const probeResult = yield* ffmpegClient.ffprobe(path.join(testDir, file))
          expect(probeResult.duration).toBeDefined()

          const srtPath = path.join(testDir, 'test.srt')
          yield* ffmpegClient.execute('-i', path.join(testDir, file), '-map', '0:s:0', '-c:s', 'srt', srtPath)

          expect(yield* isForcedSubtitle(srtPath, probeResult.duration)).toBe(expected)
        }).pipe(Effect.ensuring(Effect.ignore(fs.remove(testDir, { recursive: true }))))
      }).pipe(Effect.provide(BunServices.layer))
    )
  }
})
