import { Effect, FileSystem, type PlatformError, Result, Schema } from 'effect'
import { type ChildProcessSpawner } from 'effect/unstable/process'

import env from '@/config/env'
import { FileNotFoundError } from '@/features/transcoding/errors'
import { ffprobeOutputValidator, type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'
import { type CommandExecutionError } from '@/shared/errors/command'
import { ValidationError } from '@/shared/errors/validation'
import { spawn } from '@/shared/utils/command'
import { formatSchemaIssueMessage } from '@/shared/utils/schema'

type FfmpegError = CommandExecutionError | FileNotFoundError | PlatformError.PlatformError | ValidationError
type FfmpegRequirements = ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem

export interface IFfmpegClient {
  readonly execute: (...command: string[]) => Effect.Effect<string, CommandExecutionError>
  readonly executeFfmpeg: (params: { command: string[]; folderName: string; input: string; output: string }) => Effect.Effect<string, FfmpegError>
  readonly ffprobe: (input: string) => Effect.Effect<{ duration: number; streams: FFprobeStream[] }, FfmpegError>
}

export class FfmpegClient {
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
      const json = Schema.decodeResult(Schema.fromJsonString(Schema.Unknown))(output)
      if (Result.isFailure(json)) {
        return yield* new ValidationError({ cause: json.failure, details: 'FFprobe returned invalid JSON' })
      }
      const parsed = Schema.decodeUnknownResult(ffprobeOutputValidator, { errors: 'all' })(json.success)
      if (Result.isFailure(parsed)) {
        return yield* new ValidationError({ details: formatSchemaIssueMessage(parsed.failure.issue) })
      }
      return { duration: parsed.success.format.duration, streams: parsed.success.streams }
    })
  }

  execute(...command: string[]) {
    return spawn({ args: ['-hide_banner', '-loglevel', 'error', '-y', ...command], command: 'ffmpeg' })
  }
}

export const makeFfmpegClient: Effect.Effect<IFfmpegClient, never, FfmpegRequirements> = Effect.gen(function* () {
  const context = yield* Effect.context<FfmpegRequirements>()
  const client = new FfmpegClient()
  return {
    execute: (...command: string[]) => Effect.provideContext(client.execute(...command), context),
    executeFfmpeg: (params: { command: string[]; folderName: string; input: string; output: string }) =>
      Effect.provideContext(client.executeFfmpeg(params), context),
    ffprobe: (input: string) => Effect.provideContext(client.ffprobe(input), context),
  }
})
