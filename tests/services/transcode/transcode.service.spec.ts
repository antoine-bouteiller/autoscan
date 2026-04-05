import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vite-plus/test'

import { container, TOKENS } from '#core/container'
import { type FfmpegClient } from '#integrations/ffmpeg.service'
import { transcodeFile, transcodeQueue } from '#services/transcode/transcode.service'
import { isOk } from '#utils/error'
import { type FFprobeStream } from '#validators/ffmpeg.validator'

import { refreshSectionsMock } from '../../mocks/plex.mock.js'
import { testWithTestDir, videosPath } from '../../utils.ts'

const waitForQueueCompletion = async (): Promise<void> =>
  new Promise((resolve) => {
    const checkQueue = () => {
      const status = transcodeQueue.getStatus()
      if (!status.isProcessing && status.queueLength === 0) {
        resolve()
      } else {
        setTimeout(checkQueue, 100)
      }
    }
    checkQueue()
  })

interface FileDataset {
  filename: string
  outputStreams: {
    codecName: string
    codecType: string
    index: number
    language?: NonNullable<FFprobeStream['tags']>['language']
  }[]
  shouldExecute: boolean
  title: string
}

const dataset: FileDataset[] = [
  {
    filename: 'test_audio_dts.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: true,
    title: 'should convert dts to aac',
  },
  {
    filename: 'test_correct_file.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: true,
    title: 'should convert format to mp4',
  },
  {
    filename: 'test_audio_aac_dts.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: true,
    title: 'should keep only wanted tracks',
  },
  {
    filename: 'test_correct_file.mp4',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'en' },
    ],
    shouldExecute: false,
    title: 'should not transcode already correct file',
  },
  {
    filename: 'test_audio_spa.mkv',
    outputStreams: [],
    shouldExecute: false,
    title: 'should not transcode if no audio stream would be kept in output',
  },
]

describe('Transcode', () => {
  testWithTestDir.for(dataset)('$title', async ({ filename, outputStreams, shouldExecute }, { testDir }) => {
    copyFileSync(join(videosPath, filename), join(testDir, filename))

    const executed = await transcodeFile({ file: join(testDir, filename), mediaTitle: 'test', mediaType: 'movie', originalLanguage: 'en' })

    expect(executed).toBe(shouldExecute)

    if (!executed) {
      expect(existsSync(join(testDir, filename))).toBe(true)
      return
    }

    await waitForQueueCompletion()

    const outputFileName = filename.replace('.mkv', '.mp4')
    expect(existsSync(join(testDir, outputFileName))).toBe(true)
    expect(existsSync(join(testDir, outputFileName.replace('.mp4', '.en.srt')))).toBe(true)

    if (outputFileName !== filename) {
      expect(existsSync(join(testDir, filename))).toBe(false)
    }

    const ffmpegClient = container.resolve<FfmpegClient>(TOKENS.FFMPEG_CLIENT)
    const probeResult = await ffmpegClient.ffprobe(join(testDir, outputFileName))
    expect(isOk(probeResult)).toBe(true)
    if (!isOk(probeResult)) {
      return
    }

    for (const stream of outputStreams) {
      expect(probeResult.streams[stream.index]?.codec_type).toBe(stream.codecType)
      expect(probeResult.streams[stream.index]?.codec_name).toBe(stream.codecName)
      if (stream.language) {
        expect(probeResult.streams[stream.index]?.tags?.language).toBe(stream.language)
      }
    }
  })

  test('Should refresh section when file not found', async () => {
    const executed = await transcodeFile({ file: 'unkown file.mp4', mediaTitle: 'test', mediaType: 'movie', originalLanguage: 'en' })

    expect(executed).toBe(false)

    expect(refreshSectionsMock).toHaveBeenCalled()
  })
})
