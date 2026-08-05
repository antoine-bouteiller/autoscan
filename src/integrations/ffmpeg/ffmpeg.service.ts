import { Effect } from 'effect'
import { z } from 'zod'

import env from '@/config/env'
import { type FileAccessError, FileNotFoundError } from '@/features/transcoding/errors'
import { ffprobeOutputValidator, type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'
import { type CommandExecutionError } from '@/shared/errors/command'
import { ValidationError } from '@/shared/errors/validation'
import { spawn } from '@/shared/utils/exec_promisify'
import { exists, mkdir } from '@/shared/utils/fs'

type FfmpegError = CommandExecutionError | FileAccessError | FileNotFoundError | ValidationError

export interface IFfmpegClient {
  readonly execute: (...command: string[]) => Effect.Effect<string, CommandExecutionError>
  readonly executeFfmpeg: (params: { command: string[]; folderName: string; input: string; output: string }) => Effect.Effect<string, FfmpegError>
  readonly ffprobe: (input: string) => Effect.Effect<{ duration: number; streams: FFprobeStream[] }, FfmpegError>
}

export class FfmpegClient implements IFfmpegClient {
  executeFfmpeg(params: { folderName: string; input: string; output: string; command: string[] }) {
    return Effect.gen(function* () {
      if (!(yield* exists(params.input))) {
        return yield* new FileNotFoundError({ filePath: params.input })
      }

      const directory = `${env.TRANSCODE_PATH}/${params.folderName}`
      yield* mkdir(directory)
      return yield* spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        params.input,
        ...params.command,
        `${directory}/${params.output}`,
      ])
    })
  }

  ffprobe(input: string) {
    return Effect.gen(function* () {
      if (!(yield* exists(input))) {
        return yield* new FileNotFoundError({ filePath: input })
      }

      const output = yield* spawn(
        'ffprobe',
        [
          '-loglevel',
          'error',
          '-show_entries',
          'stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language,title:format=duration',
          '-print_format',
          'json',
          input,
        ],
        { timeout: 120_000 }
      )
      const json = yield* Effect.try({
        catch: (cause) => new ValidationError({ cause, details: 'FFprobe returned invalid JSON' }),
        try: () => JSON.parse(output),
      })
      const parsed = ffprobeOutputValidator.safeParse(json)
      if (!parsed.success) {
        return yield* new ValidationError({ details: JSON.stringify(z.treeifyError(parsed.error)) })
      }
      return { duration: parsed.data.format?.duration ?? 0, streams: parsed.data.streams }
    })
  }

  execute(...command: string[]) {
    return spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...command])
  }
}
