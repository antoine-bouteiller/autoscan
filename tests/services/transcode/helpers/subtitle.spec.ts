import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect } from '@effect/vitest'
import { Effect } from 'effect'

import { FfmpegClient } from '@/integrations/ffmpeg.service'
import { processSubtitleStreams } from '@/services/transcode/helpers/subtitle'
import type { ISOCode1 } from '@/types/iso_codes'

import { testWithTestDir, videosPath } from '../../../config.js'

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
  testWithTestDir.for(dataset)('$title', ({ file, originalLanguage, streamToKeep }, { testDir }) => {
    copyFileSync(join(videosPath, file), join(testDir, file))

    return Effect.runPromise(
      Effect.gen(function* () {
        const ffmpeg = yield* FfmpegClient
        const streams = yield* ffmpeg.ffprobe(join(testDir, file))
        const subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')
        const streamsKepts = processSubtitleStreams([...subtitleStreams], originalLanguage, 'test')
        expect(streamsKepts.length).toBe(streamToKeep.length)
      }).pipe(Effect.provide(FfmpegClient.Default))
    )
  })
})
