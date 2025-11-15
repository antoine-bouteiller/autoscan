import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import { logger } from '@/config/logger'

export const processVideoStreams = (
  videoStreams: FFprobeStream[],
  mediaTitle: string
): { command: string[]; shouldExecute: boolean } => {
  const command: string[] = []
  let shouldExecute = false

  if (videoStreams.length === 0) {
    return { command, shouldExecute }
  }

  let countVideoStreamToKeep = 0

  for (const [index, stream] of videoStreams.entries()) {
    if (
      stream.codec_name?.toLowerCase() === 'mjpeg' ||
      stream.codec_name?.toLowerCase() === 'png' ||
      stream.codec_name?.toLowerCase() === 'gif'
    ) {
      logger.warn(
        `[${mediaTitle}] Video stream 0:v:${index} is ${stream.codec_name.toLowerCase()} removing.`
      )
    } else {
      command.push(`-map 0:v:${index}`)
      countVideoStreamToKeep++
    }
  }

  if (videoStreams.length === 0) {
    throw new Error(`[${mediaTitle}] No video streams found`)
  }

  if (countVideoStreamToKeep !== videoStreams.length) {
    shouldExecute = true
  }

  return { command, shouldExecute }
}
