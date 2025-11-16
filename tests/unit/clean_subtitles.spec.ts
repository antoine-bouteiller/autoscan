import { describe, expect, test } from 'bun:test'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import type { iso2 } from '@/types/iso_codes'

import { ffprobe } from '@/app/integrations/ffmpeg/ffmpeg_client'
import { processSubtitleStreams } from '@/app/services/transcode/helpers/subtitle_processor.js'

import { setupTestContext, videosPath } from '../config.js'

interface TestCase {
  exists: boolean
  file: string
  language: iso2
  title: string
}

const dataset: TestCase[] = [
  {
    exists: true,
    file: 'test_subtitle_undefined.mkv',
    language: 'eng',
    title: 'should tag subtitle stream with language if language is undefined - eng',
  },
  {
    exists: true,
    file: 'test_subtitle_forced.mkv',
    language: 'eng',
    title: 'should keep non forced eng subtitle',
  },
  {
    exists: true,
    file: 'test_subtitle_forced_undefined.mkv',
    language: 'eng',
    title: 'should keep undefined over forced eng subtitle',
  },
  {
    exists: false,
    file: 'test_subtitle_forced.mkv',
    language: 'fre',
    title: 'should not keep subilte if original language is fra',
  },
]

describe('Extract subtitles', () => {
  for (const testCase of dataset) {
    const getContext = setupTestContext(testCase.title)

    test(testCase.title, async () => {
      const { testDir } = getContext()
      const { exists, file, language } = testCase

      copyFileSync(join(videosPath, file), join(testDir, file))

      const streams = await ffprobe(join(testDir, file))
      const subtitleStreams = streams.filter((stream) => stream.codec_type === 'subtitle')

      const fileName = file.slice(0, file.lastIndexOf('.')).split('/').pop() ?? file

      await processSubtitleStreams(join(testDir, file), fileName, subtitleStreams, language, 'test')

      const output = join(testDir, 'transcode', file.replace('.mkv', `.${language}.srt`))

      if (exists) {
        expect(existsSync(output)).toBe(true)
      } else {
        expect(existsSync(output)).toBe(false)
      }
    })
  }
})
