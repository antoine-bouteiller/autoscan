import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'

import type { FfprobeStream } from '@/schemas/ffmpeg'
import { processVideoStreams } from '@/services/transcode/helpers/video'

describe('processVideoStreams', () => {
  it('should keep valid video streams', () => {
    const videoStreams: FfprobeStream[] = [{ codec_name: 'h264', codec_type: 'video', index: 0 }]

    const result = Effect.runSync(processVideoStreams(videoStreams, 'test-media'))

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(false)
  })

  it('should remove mjpeg streams', () => {
    const videoStreams: FfprobeStream[] = [
      { codec_name: 'h264', codec_type: 'video', index: 0 },
      { codec_name: 'mjpeg', codec_type: 'video', index: 1 },
    ]

    const result = Effect.runSync(processVideoStreams(videoStreams, 'test-media'))

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })

  it('should remove png streams', () => {
    const videoStreams: FfprobeStream[] = [
      { codec_name: 'h264', codec_type: 'video', index: 0 },
      { codec_name: 'png', codec_type: 'video', index: 1 },
    ]

    const result = Effect.runSync(processVideoStreams(videoStreams, 'test-media'))

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })

  it('should remove gif streams', () => {
    const videoStreams: FfprobeStream[] = [
      { codec_name: 'h264', codec_type: 'video', index: 0 },
      { codec_name: 'gif', codec_type: 'video', index: 1 },
    ]

    const result = Effect.runSync(processVideoStreams(videoStreams, 'test-media'))

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })

  it('should handle multiple valid video streams', () => {
    const videoStreams: FfprobeStream[] = [
      { codec_name: 'h264', codec_type: 'video', index: 0 },
      { codec_name: 'hevc', codec_type: 'video', index: 1 },
    ]

    const result = Effect.runSync(processVideoStreams(videoStreams, 'test-media'))

    expect(result.command).toEqual(['-map', '0:v:0', '-map', '0:v:1'])
    expect(result.shouldExecute).toBe(false)
  })

  it('should return empty command for no video streams', () => {
    const videoStreams: FfprobeStream[] = []

    const result = Effect.runSync(processVideoStreams(videoStreams, 'test-media'))

    expect(result.command).toEqual([])
    expect(result.shouldExecute).toBe(false)
  })

  it('should handle case-insensitive codec names', () => {
    const videoStreams: FfprobeStream[] = [
      { codec_name: 'H264', codec_type: 'video', index: 0 },
      { codec_name: 'MJPEG', codec_type: 'video', index: 1 },
    ]

    const result = Effect.runSync(processVideoStreams(videoStreams, 'test-media'))

    expect(result.command).toEqual(['-map', '0:v:0'])
    expect(result.shouldExecute).toBe(true)
  })
})
