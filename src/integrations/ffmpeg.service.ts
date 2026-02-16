import { Effect, Schema } from 'effect'
import { mkdirSync } from 'node:fs'

import { ValidationError } from '@/errors'
import { FfprobeOutput } from '@/schemas/ffmpeg'
import { spawn } from '@/utils/spawn'

export class FfmpegClient extends Effect.Service<FfmpegClient>()('FfmpegClient', {
  accessors: true,
  sync: () => {
    const executeFfmpeg = Effect.fn('FfmpegClient.executeFfmpeg')(function* (id: number, input: string, output: string, command: string[]) {
      const path = input.split('/')
      path.pop()

      yield* Effect.sync(() => {
        mkdirSync(`${path.join('/')}/transcode/${id}`, { recursive: true })
      })

      return yield* spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        input,
        ...command,
        `${path.join('/')}/transcode/${id}/${output}`,
      ])
    })

    const ffprobe = Effect.fn('FfmpegClient.ffprobe')(function* (input: string) {
      const output = yield* spawn('ffprobe', [
        '-loglevel',
        'error',
        '-show_entries',
        'stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language',
        '-print_format',
        'json',
        input,
      ])

      const parsed = yield* Schema.decodeUnknown(Schema.parseJson(FfprobeOutput))(output).pipe(
        Effect.mapError((e) => new ValidationError({ errors: String(e), message: `Validation error: ${String(e)}` }))
      )

      return parsed.streams
    })

    const execute = Effect.fn('FfmpegClient.execute')(function* (...command: string[]) {
      return yield* spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...command])
    })

    return {
      execute,
      executeFfmpeg,
      ffprobe,
    }
  },
}) {}
