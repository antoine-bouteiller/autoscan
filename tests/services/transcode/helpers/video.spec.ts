import { describe, expect, test } from 'vite-plus/test'

import { processVideoStreams } from '@/services/transcode/helpers/video'
import type { FFprobeStream } from '@/validators/ffmpeg.validator'

import { isOk } from '../../../../src/utils/error'

describe('processVideoStreams', () => {
  test('should keep valid video streams', () => {
    const videoStreams: FFprobeStream[] = [
      {
        codec_name: 'h264',
        codec_type: 'video',
        index: 0,
      },
    ]

    const result = processVideoStreams(videoStreams, 'test-media')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(false)
  })

  test('should remove mjpeg streams', () => {
    const videoStreams: FFprobeStream[] = [
      {
        codec_name: 'h264',
        codec_type: 'video',
        index: 0,
      },
      {
        codec_name: 'mjpeg',
        codec_type: 'video',
        index: 1,
      },
    ]

    const result = processVideoStreams(videoStreams, 'test-media')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })

  test('should remove png streams', () => {
    const videoStreams: FFprobeStream[] = [
      {
        codec_name: 'h264',
        codec_type: 'video',
        index: 0,
      },
      {
        codec_name: 'png',
        codec_type: 'video',
        index: 1,
      },
    ]

    const result = processVideoStreams(videoStreams, 'test-media')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })

  test('should remove gif streams', () => {
    const videoStreams: FFprobeStream[] = [
      {
        codec_name: 'h264',
        codec_type: 'video',
        index: 0,
      },
      {
        codec_name: 'gif',
        codec_type: 'video',
        index: 1,
      },
    ]

    const result = processVideoStreams(videoStreams, 'test-media')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })

  test('should handle multiple valid video streams', () => {
    const videoStreams: FFprobeStream[] = [
      {
        codec_name: 'h264',
        codec_type: 'video',
        index: 0,
      },
      {
        codec_name: 'hevc',
        codec_type: 'video',
        index: 1,
      },
    ]

    const result = processVideoStreams(videoStreams, 'test-media')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual(['-map', '0:v:0', '-map', '0:v:1'])
    expect(result.shouldExecute).toBe(false)
  })

  test('should return empty command for no video streams', () => {
    const videoStreams: FFprobeStream[] = []

    const result = processVideoStreams(videoStreams, 'test-media')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual([])
    expect(result.shouldExecute).toBe(false)
  })

  test('should handle case-insensitive codec names', () => {
    const videoStreams: FFprobeStream[] = [
      {
        codec_name: 'H264',
        codec_type: 'video',
        index: 0,
      },
      {
        codec_name: 'MJPEG',
        codec_type: 'video',
        index: 1,
      },
    ]

    const result = processVideoStreams(videoStreams, 'test-media')
    expect(isOk(result)).toBe(true)
    if (!isOk(result)) {
      return
    }

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })
})
