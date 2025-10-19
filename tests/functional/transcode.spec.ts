import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'

import type { iso2 } from '@/types/iso_codes'

import { ffprobe } from '@/app/services/ffmpeg_service'
import { TranscodeService } from '@/app/services/transcode_service'

import { test, videosPath } from '../config.js'

interface FileDataset {
  filename: string
  keepFile?: boolean
  outputStreams: {
    codecName: string
    codecType: string
    index: number
    language?: iso2
  }[]
  shouldExecute: boolean
  title: string
}

const dataset: FileDataset[] = [
  {
    filename: 'test_audio_dts.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'eng' },
    ],
    shouldExecute: true,
    title: 'should convert dts to aac',
  },
  {
    filename: 'test_correct_file.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'eng' },
    ],
    shouldExecute: true,
    title: 'should convert format to mp4',
  },
  {
    filename: 'test_audio_aac_dts.mkv',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'eng' },
    ],
    shouldExecute: true,
    title: 'should keep only wanted tracks',
  },
  {
    filename: 'test_correct_file.mp4',
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'eng' },
    ],
    shouldExecute: false,
    title: 'should not transcode already correct file',
  },
  {
    filename: 'test_audio_spa.mkv',
    keepFile: true,
    outputStreams: [
      { codecName: 'h264', codecType: 'video', index: 0 },
      { codecName: 'aac', codecType: 'audio', index: 1, language: 'spa' },
    ],
    shouldExecute: true,
    title: 'should not keep transcoded file if no audio stream in output',
  },
]

describe('Transcode', () => {
  test.for(dataset)(
    '$title',
    async ({ filename, keepFile, outputStreams, shouldExecute }, { testDir }) => {
      copyFileSync(join(videosPath, filename), join(testDir, filename))

      const transcodeService = new TranscodeService(join(testDir, filename), 'test', 'eng')
      const executed = await transcodeService.transcodeFile()

      expect(executed).toBe(shouldExecute)

      if (!executed || keepFile) {
        expect(existsSync(join(testDir, filename))).toBe(true)
        return
      }

      const outputFileName = filename.replace('.mkv', '.mp4')
      expect(existsSync(join(testDir, outputFileName))).toBe(true)
      expect(existsSync(join(testDir, outputFileName.replace('.mp4', '.eng.srt')))).toBe(true)

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
    }
  )
})
