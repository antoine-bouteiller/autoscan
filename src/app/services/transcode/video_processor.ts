import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import { logger } from '@/config/logger'

export class VideoProcessor {
  private command: string[] = []
  private shouldExecute = false

  constructor(
    private videoStreams: FFprobeStream[],
    private mediaTitle: string
  ) {}

  process(): { command: string[]; shouldExecute: boolean } {
    if (this.videoStreams.length === 0) {
      return { command: this.command, shouldExecute: this.shouldExecute }
    }

    let countVideoStreamToKeep = 0

    for (const [index, stream] of this.videoStreams.entries()) {
      if (
        stream.codec_name?.toLowerCase() === 'mjpeg' ||
        stream.codec_name?.toLowerCase() === 'png' ||
        stream.codec_name?.toLowerCase() === 'gif'
      ) {
        logger.warn(
          `[${this.mediaTitle}] Video stream 0:v:${index} is ${stream.codec_name.toLowerCase()} removing.`
        )
      } else {
        this.command.push(`-map 0:v:${index}`)
        countVideoStreamToKeep++
      }
    }

    if (this.videoStreams.length === 0) {
      throw new Error(`[${this.mediaTitle}] No video streams found`)
    }

    if (countVideoStreamToKeep !== this.videoStreams.length) {
      this.shouldExecute = true
    }

    return { command: this.command, shouldExecute: this.shouldExecute }
  }
}
