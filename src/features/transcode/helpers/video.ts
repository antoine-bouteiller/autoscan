import type { FFprobeStream } from '@/integrations/ffmpeg/validator'

import { logger } from '@/config/logger'
import { MediaError } from '@/errors'

export const processVideoStreams = (videoStreams: FFprobeStream[], mediaTitle: string): { command: string[]; shouldExecute: boolean } => {
  const command: string[] = []
  let shouldExecute = false

  if (videoStreams.length === 0) {
    return { command, shouldExecute }
  }

  let countVideoStreamToKeep = 0

  for (const [index, stream] of videoStreams.entries()) {
    if (stream.codec_name?.toLowerCase() === 'mjpeg' || stream.codec_name?.toLowerCase() === 'png' || stream.codec_name?.toLowerCase() === 'gif') {
      logger.warn(`Video stream 0:v:${index} is ${stream.codec_name.toLowerCase()} removing.`, 'Video', mediaTitle)
    } else {
      command.push(`-map`, `0:v:${index}`)
      countVideoStreamToKeep++
    }
  }

  if (countVideoStreamToKeep === 0) {
    throw new MediaError('video_stream_not_found', mediaTitle)
  }

  if (countVideoStreamToKeep !== videoStreams.length) {
    shouldExecute = true
  }

  return { command, shouldExecute }
}
