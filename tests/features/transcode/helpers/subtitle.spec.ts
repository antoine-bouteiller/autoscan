import { describe, expect, test } from 'bun:test'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import type { FfmpegClient } from '@/integrations/ffmpeg/client'
import type { ISOCode1 } from '@/types/iso_codes'

import { container, TOKENS } from '@/core/bootstrap'
import { processSubtitleStreams } from '@/features/transcode/helpers/subtitle'

import { setupTestContext, videosPath } from '../../../config.js'

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
  for (const testCase of dataset) {
    const getContext = setupTestContext(testCase.title)

    test(testCase.title, async () => {
      const { testDir } = getContext()
      const { file, originalLanguage, streamToKeep } = testCase

      copyFileSync(join(videosPath, file), join(testDir, file))

      const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
      const streams = await ffmpegClient.ffprobe(join(testDir, file))
      const subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')

      const streamsKepts = await processSubtitleStreams(subtitleStreams, originalLanguage, 'test')

      expect(streamsKepts.length).toBe(streamToKeep.length)
    })
  }
})
