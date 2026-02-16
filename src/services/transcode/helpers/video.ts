import { Effect } from 'effect'

import type { FfprobeStream } from '@/schemas/ffmpeg'

import { VideoStreamNotFoundError } from '@/errors'

export const processVideoStreams = (
  videoStreams: FfprobeStream[],
  mediaTitle: string
): Effect.Effect<{ command: string[]; shouldExecute: boolean }, VideoStreamNotFoundError> =>
  Effect.gen(function* () {
    const command: string[] = []
    let shouldExecute = false

    if (videoStreams.length === 0) {
      return { command, shouldExecute }
    }

    let countVideoStreamToKeep = 0

    for (const [index, stream] of videoStreams.entries()) {
      const codec = stream.codec_name?.toLowerCase()
      if (codec === 'mjpeg' || codec === 'png' || codec === 'gif') {
        continue
      } else {
        command.push(`-map`, `0:v:${index}`)
        countVideoStreamToKeep++
      }
    }

    if (countVideoStreamToKeep === 0) {
      return yield* new VideoStreamNotFoundError({ mediaTitle, message: `(${mediaTitle}) No video streams found` })
    }

    if (countVideoStreamToKeep !== videoStreams.length) {
      shouldExecute = true
    }

    return { command, shouldExecute }
  })
