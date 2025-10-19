import { test, videosPath } from '../config.js'
import { TranscodeService } from '@/app/services/transcode_service'
import { describe, expect } from 'vitest'
import type { iso2 } from '@/types/iso_codes'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

interface TestCase {
  expected: {
    commandAt?: { index: number; value: string }[]
    length: number
  }
  file: string
  language: iso2
  title: string
}

const dataset: TestCase[] = [
  {
    expected: {
      commandAt: [{ index: 2, value: '-metadata:s:a:0 language=eng' }],
      length: 3,
    },
    file: 'test_audio_undefined.mkv',
    language: 'eng',
    title: 'should tag audio stream with language if language is undefined - eng',
  },
  {
    expected: {
      commandAt: [{ index: 2, value: '-metadata:s:a:0 language=fre' }],
      length: 3,
    },
    file: 'test_audio_undefined.mkv',
    language: 'fre',
    title: 'should tag audio stream with language if language is undefined - fre',
  },
  {
    expected: {
      commandAt: [{ index: 2, value: '-c:a:0 aac' }],
      length: 4,
    },
    file: 'test_audio_dts.mkv',
    language: 'eng',
    title: 'should convert dts to aac',
  },
  {
    expected: {
      commandAt: [{ index: 1, value: '-map 0:a:0' }],
      length: 2,
    },
    file: 'test_audio_aac_dts.mkv',
    language: 'eng',
    title: 'should keep aac over dts',
  },
  {
    expected: {
      length: 4,
    },
    file: 'test_audio_fre_eng_spa.mkv',
    language: 'spa',
    title: 'should keep fre, eng and original language',
  },
]

describe('Clean audio', () => {
  test.for(dataset)('$title', async ({ expected, file, language }, { testDir }) => {
    copyFileSync(join(videosPath, file), join(testDir, file))

    const transcodeService = new TranscodeService(join(testDir, file), 'test', language)
    await transcodeService.init()

    transcodeService.cleanAudio()

    const command = transcodeService.command

    expect(command.length).toBe(expected.length)

    expected.commandAt?.forEach(({ index, value }) => {
      expect(command[index]).toBe(value)
    })
  })
})
