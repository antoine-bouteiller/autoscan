import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect } from '@effect/vitest'
import { Effect } from 'effect'

import { FfmpegClient } from '@/integrations/ffmpeg.service'
import { processAudioStreams } from '@/services/transcode/helpers/audio'
import type { ISOCode1 } from '@/types/iso_codes'

import { testWithTestDir, videosPath } from '../../../config.js'

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
  testWithTestDir.for(dataset)('$title', ({ expectedCommand, file, language }, { testDir }) => {
    copyFileSync(join(videosPath, file), join(testDir, file))

    return Effect.runPromise(
      Effect.gen(function* () {
        const ffmpeg = yield* FfmpegClient
        const streams = yield* ffmpeg.ffprobe(join(testDir, file))
        const audioStreams = streams.filter((stream) => stream.codec_type === 'audio')
        const result = yield* processAudioStreams([...audioStreams], language, 'test')
        expect(result.command).toEqual(expectedCommand)
      }).pipe(Effect.provide(FfmpegClient.Default))
    )
  })
})
