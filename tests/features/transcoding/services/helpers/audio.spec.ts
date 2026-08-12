import { BunServices } from '@effect/platform-bun'
import { describe, expect, it } from '@tests/it'
import { makeTestDir, videosPath } from '@tests/utils'
import { Effect, FileSystem, Path } from 'effect'

import { processAudioStreams } from '@/features/transcoding/services/helpers/audio'
import { FfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type ISOCode1 } from '@/shared/types/iso_codes'

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
  for (const { expectedCommand, file, language, title } of dataset) {
    it.live(title, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const testDir = yield* makeTestDir
        yield* Effect.gen(function* () {
          yield* fs.copyFile(path.join(videosPath, file), path.join(testDir, file))

          const probeResult = yield* new FfmpegClient().ffprobe(path.join(testDir, file))
          const audioStreams = probeResult.streams.filter((stream) => stream.codec_type === 'audio')
          const result = processAudioStreams(audioStreams, language, 'test')
          expect(result).not.toBeInstanceOf(Error)
          if (!(result instanceof Error)) {
            expect(result.command).toEqual(expectedCommand)
          }
        }).pipe(Effect.ensuring(Effect.ignore(fs.remove(testDir, { recursive: true }))))
      }).pipe(Effect.provide(BunServices.layer))
    )
  }
})
