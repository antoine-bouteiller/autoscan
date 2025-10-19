import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'

import type { iso2 } from '@/types/iso_codes'

import { TranscodeService } from '@/app/services/transcode_service'

import { test, videosPath } from '../config.js'

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
    title: 'should not keep subilte if original language is fre',
  },
]

describe('Extract subtitles', () => {
  test.for(dataset)('$title', async ({ exists, file, language }, { testDir }) => {
    copyFileSync(join(videosPath, file), join(testDir, file))

    const transcodeService = new TranscodeService(join(testDir, file), 'test', language)
    await transcodeService.init()

    await transcodeService.extractSubtitles()

    const output = join(testDir, 'transcode', file.replace('.mkv', `.${language}.srt`))

    if (exists) {
      expect(existsSync(output)).toBe(true)
    } else {
      expect(existsSync(output)).toBe(false)
    }
  })
})
