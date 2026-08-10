import { nativeLogger } from '@/config/logger'
import { VideoStreamNotFoundError } from '@/features/transcoding/errors'
import { type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'

export const processVideoStreams = (videoStreams: FFprobeStream[], mediaTitle: string) => {
  const command: string[] = []
  let shouldExecute = false

  if (videoStreams.length === 0) {
    return { command, shouldExecute }
  }

  let countVideoStreamToKeep = 0

  for (const [index, stream] of videoStreams.entries()) {
    if (stream.codec_name?.toLowerCase() === 'mjpeg' || stream.codec_name?.toLowerCase() === 'png' || stream.codec_name?.toLowerCase() === 'gif') {
      nativeLogger.warn(`Video stream 0:v:${index} is ${stream.codec_name.toLowerCase()} removing.`, 'Video', mediaTitle)
    } else {
      command.push(`-map`, `0:v:${index}`)
      countVideoStreamToKeep++
    }
  }

  if (countVideoStreamToKeep === 0) {
    return new VideoStreamNotFoundError({ mediaTitle })
  }

  if (countVideoStreamToKeep !== videoStreams.length) {
    shouldExecute = true
  }

  return { command, shouldExecute }
}
