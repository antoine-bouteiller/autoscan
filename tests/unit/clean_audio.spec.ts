import { setupTestContext, videosPath } from '../config.js'
import { AudioProcessor } from '@/app/services/transcode/audio_processor'
import { ffprobe } from '@/app/services/infrastructure/ffmpeg_service'
import { describe, expect, test } from 'bun:test'
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
      commandAt: [{ index: 1, value: '-metadata:s:a:0 language=eng' }],
      length: 2,
    },
    file: 'test_audio_undefined.mkv',
    language: 'eng',
    title: 'should tag audio stream with language if language is undefined - eng',
  },
  {
    expected: {
      commandAt: [{ index: 1, value: '-metadata:s:a:0 language=fre' }],
      length: 2,
    },
    file: 'test_audio_undefined.mkv',
    language: 'fre',
    title: 'should tag audio stream with language if language is undefined - fre',
  },
  {
    expected: {
      commandAt: [{ index: 1, value: '-c:a:0 aac' }],
      length: 3,
    },
    file: 'test_audio_dts.mkv',
    language: 'eng',
    title: 'should convert dts to aac',
  },
  {
    expected: {
      commandAt: [{ index: 0, value: '-map 0:a:0' }],
      length: 1,
    },
    file: 'test_audio_aac_dts.mkv',
    language: 'eng',
    title: 'should keep aac over dts',
  },
  {
    expected: {
      length: 3,
    },
    file: 'test_audio_fre_eng_spa.mkv',
    language: 'spa',
    title: 'should keep fre, eng and original language',
  },
]

describe('Clean audio', () => {
  for (const testCase of dataset) {
    const getContext = setupTestContext(testCase.title)

    test(testCase.title, async () => {
      const { testDir } = getContext()
      const { expected, file, language } = testCase

      copyFileSync(join(videosPath, file), join(testDir, file))

      const streams = await ffprobe(join(testDir, file))
      const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')

      const audioProcessor = new AudioProcessor(audioStreams, language, 'test')
      const result = audioProcessor.process()

      expect(result.command.length).toBe(expected.length)

      for (const { index, value } of expected.commandAt ?? []) {
        expect(result.command[index]).toBe(value)
      }
    })
  }
})
