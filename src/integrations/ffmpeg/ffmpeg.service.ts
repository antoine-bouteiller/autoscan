import { Effect, FileSystem, type PlatformError, Result, Schema } from 'effect'
import { type ChildProcessSpawner } from 'effect/unstable/process'

import env from '@/config/env'
import { FileNotFoundError } from '@/features/transcoding/errors'
import { ffprobeOutputValidator, type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'
import { type CommandExecutionError } from '@/shared/errors/command'
import { ValidationError } from '@/shared/errors/validation'
import { spawn } from '@/shared/utils/command'
import { formatSchemaIssue } from '@/shared/utils/schema'

type FfmpegError = CommandExecutionError | FileNotFoundError | PlatformError.PlatformError | ValidationError
type FfmpegRequirements = ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem

export interface IFfmpegClient {
  readonly execute: (...command: string[]) => Effect.Effect<string, CommandExecutionError, FfmpegRequirements>
  readonly executeFfmpeg: (params: {
    command: string[]
    folderName: string
    input: string
    output: string
  }) => Effect.Effect<string, FfmpegError, FfmpegRequirements>
  readonly ffprobe: (input: string) => Effect.Effect<{ duration: number; streams: FFprobeStream[] }, FfmpegError, FfmpegRequirements>
}

export class FfmpegClient implements IFfmpegClient {
  executeFfmpeg(params: { folderName: string; input: string; output: string; command: string[] }) {
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      if (!(yield* fs.exists(params.input))) {
        return yield* new FileNotFoundError({ filePath: params.input })
      }

      const directory = `${env.TRANSCODE_PATH}/${params.folderName}`
      yield* fs.makeDirectory(directory, { recursive: true })
      return yield* spawn({
        args: ['-hide_banner', '-loglevel', 'error', '-y', '-i', params.input, ...params.command, `${directory}/${params.output}`],
        command: 'ffmpeg',
      })
    })
  }

  ffprobe(input: string) {
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      if (!(yield* fs.exists(input))) {
        return yield* new FileNotFoundError({ filePath: input })
      }

      const output = yield* spawn({
        args: [
          '-loglevel',
          'error',
          '-show_entries',
          'stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language,title:format=duration',
          '-print_format',
          'json',
          input,
        ],
        command: 'ffprobe',
        timeout: 120_000,
      })
      const json = yield* Effect.try({
        catch: (cause) => new ValidationError({ cause, details: 'FFprobe returned invalid JSON' }),
        try: () => JSON.parse(output),
      })
      const parsed = Schema.decodeUnknownResult(ffprobeOutputValidator, { errors: 'all' })(json)
      if (Result.isFailure(parsed)) {
        return yield* new ValidationError({ details: JSON.stringify(formatSchemaIssue(parsed.failure.issue)) })
      }
      return { duration: parsed.success.format.duration, streams: parsed.success.streams }
    })
  }

  execute(...command: string[]) {
    return spawn({ args: ['-hide_banner', '-loglevel', 'error', '-y', ...command], command: 'ffmpeg' })
  }
}
