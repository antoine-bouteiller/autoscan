import { describe, expect, test } from 'bun:test'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import type { FFprobeStream } from '@/integrations/ffmpeg/validator.js'

import { transcodeFile, transcodeQueue } from '@/features/transcode'
import { ffprobe } from '@/integrations/ffmpeg/client.js'

import { setupTestContext, videosPath } from '../../config.js'

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
  for (const testCase of dataset) {
    const getContext = setupTestContext(testCase.title)

    test(testCase.title, async () => {
      const { testDir } = getContext()
      const { filename, outputStreams, shouldExecute } = testCase

      copyFileSync(join(videosPath, filename), join(testDir, filename))

      const executed = await transcodeFile(join(testDir, filename), 'test', 'en', 'movie')

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

      const streams = await ffprobe(join(testDir, outputFileName))

      for (const stream of outputStreams) {
        expect(streams[stream.index]?.codec_type).toBe(stream.codecType)
        expect(streams[stream.index]?.codec_name).toBe(stream.codecName)
        if (stream.language) {
          expect(streams[stream.index]?.tags?.language).toBe(stream.language)
        }
      }
    })
  }
})
