import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect } from 'vite-plus/test'

import { container, TOKENS } from '#core/container'
import { type FfmpegClient } from '#integrations/ffmpeg.service'
import { processAudioStreams } from '#services/transcode/helpers/audio'
import { type ISOCode1 } from '#types/iso_codes'

import { isOk } from '../../../../src/utils/error.js'
import { testWithTestDir, videosPath } from '../../../utils.ts'

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
  testWithTestDir.for(dataset)('$title', async ({ expectedCommand, file, language }, { testDir }) => {
    copyFileSync(join(videosPath, file), join(testDir, file))

    const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
    const probeResult = await ffmpegClient.ffprobe(join(testDir, file))
    expect(isOk(probeResult)).toBe(true)
    if (!isOk(probeResult)) {
      return
    }

    const audioStreams = probeResult.streams.filter((stream) => stream.codec_type === 'audio')
    const result = processAudioStreams(audioStreams, language, 'test')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual(expectedCommand)
  })
})
