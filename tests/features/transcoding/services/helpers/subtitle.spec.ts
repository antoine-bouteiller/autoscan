import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect } from 'vite-plus/test'

import { container, TOKENS } from '#/core/container'
import { isForcedSubtitle, processSubtitleStreams } from '#/features/transcoding/services/helpers/subtitle'
import { type ISOCode1 } from '#/shared/types/iso_codes'
import { isOk } from '#/shared/utils/error'

import { testWithTestDir, videosPath } from '../../../../utils.ts'

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
  testWithTestDir.for(dataset)('$title', async ({ file, originalLanguage, streamToKeep }, { testDir }) => {
    copyFileSync(join(videosPath, file), join(testDir, file))

    const ffmpegClient = container.resolve(TOKENS.FFMPEG_CLIENT)
    const probeResult = await ffmpegClient.ffprobe(join(testDir, file))
    expect(isOk(probeResult)).toBe(true)
    if (!isOk(probeResult)) {
      return
    }

    const subtitleStreams = probeResult.streams.filter((stream) => stream.codec_type === 'subtitle')

    const streamsKepts = await processSubtitleStreams(subtitleStreams, originalLanguage, 'test')

    expect(streamsKepts.length).toBe(streamToKeep.length)
  })
})

interface ForcedTestCase {
  expected: boolean
  file: string
  title: string
}

const forcedDataset: ForcedTestCase[] = [
  {
    expected: false,
    file: 'test_audio_dts.mkv',
    title: 'should detect non-forced subtitle with enough lines and screen time',
  },
  {
    expected: true,
    file: 'test_subtitle_forced_content.mkv',
    title: 'should detect forced subtitle with low line count and screen time',
  },
]

describe('Forced subtitle detection', () => {
  testWithTestDir.for(forcedDataset)('$title', async ({ expected, file }, { testDir }) => {
    copyFileSync(join(videosPath, file), join(testDir, file))

    const ffmpegClient = container.resolve(TOKENS.FFMPEG_CLIENT)
    const probeResult = await ffmpegClient.ffprobe(join(testDir, file))
    expect(isOk(probeResult)).toBe(true)
    if (!isOk(probeResult)) {
      return
    }

    expect(probeResult.duration).toBeDefined()

    const srtPath = join(testDir, 'test.srt')
    const extractResult = await ffmpegClient.execute('-i', join(testDir, file), '-map', '0:s:0', '-c:s', 'srt', srtPath)
    expect(isOk(extractResult)).toBe(true)

    expect(isForcedSubtitle(srtPath, probeResult.duration)).toBe(expected)
  })
})
