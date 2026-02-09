import { describe, expect, test } from 'bun:test'
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import type { FfmpegClient } from '@/integrations/ffmpeg.service'
import type { ISOCode1 } from '@/types/iso_codes'

import { container, TOKENS } from '@/core/container'
import { processAudioStreams } from '@/services/transcode/helpers/audio'

import { setupTestContext, videosPath } from '../../../config.js'

interface TestCase {
  expectedCommand: string[]
  file: string
  language: ISOCode1
  title: string
}

const dataset: TestCase[] = [
  {
    expectedCommand: ['-map', '0:a:0', '-metadata:s:a:0', 'language=eng'],
    file: 'test_audio_undefined.mkv',
    language: 'en',
    title: 'should tag audio stream with language if language is undefined - en',
  },
  {
    expectedCommand: ['-map', '0:a:0', '-metadata:s:a:0', 'language=fre'],
    file: 'test_audio_undefined.mkv',
    language: 'fr',
    title: 'should tag audio stream with language if language is undefined - fr',
  },
  {
    expectedCommand: ['-map', '0:a:0', '-c:a:0', 'aac', '-metadata:s:a:0', 'language=eng'],
    file: 'test_audio_dts.mkv',
    language: 'en',
    title: 'should convert dts to aac',
  },
  {
    expectedCommand: ['-map', '0:a:0'],
    file: 'test_audio_aac_dts.mkv',
    language: 'en',
    title: 'should keep aac over dts',
  },
  {
    expectedCommand: ['-map', '0:a:0', '-map', '0:a:1', '-map', '0:a:2'],
    file: 'test_audio_fre_eng_spa.mkv',
    language: 'es',
    title: 'should keep fr, en and original language',
  },
]

describe('Clean audio', () => {
  for (const testCase of dataset) {
    const getContext = setupTestContext(testCase.title)

    test(testCase.title, async () => {
      const { testDir } = getContext()
      const { expectedCommand, file, language } = testCase

      copyFileSync(join(videosPath, file), join(testDir, file))

      const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
      const streams = await ffmpegClient.ffprobe(join(testDir, file))
      const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')

      const result = processAudioStreams(audioStreams, language, 'test')

      expect(result.command).toEqual(expectedCommand)
    })
  }
})
