import { z } from 'zod'

import env from '#config/env'
import { FileNotFoundError } from '#features/transcoding/errors'
import { ffprobeOutputValidator } from '#integrations/ffmpeg/ffmpeg.validator'
import { ValidationError } from '#shared/errors/validation'
import { isError } from '#shared/utils/error'
import { spawnPromise } from '#shared/utils/exec_promisify'
import { safeExistsSync, safeMkdirSync } from '#shared/utils/fs'

export class FfmpegClient {
  executeFfmpeg(params: { folderName: string; input: string; output: string; command: string[] }) {
    if (!safeExistsSync(params.input)) {
      return new FileNotFoundError({ filePath: params.input })
    }

    const dir = `${env.TRANSCODE_PATH}/${params.folderName}`
    const mkdirResult = safeMkdirSync(dir)
    if (mkdirResult instanceof Error) {
      return mkdirResult
    }

    return spawnPromise('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', params.input, ...params.command, `${dir}/${params.output}`])
  }

  async ffprobe(input: string) {
    if (!safeExistsSync(input)) {
      return new FileNotFoundError({ filePath: input })
    }

    const output = await spawnPromise('ffprobe', [
      '-loglevel',
      'error',
      '-show_entries',
      'stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language,title:format=duration',
      '-print_format',
      'json',
      input,
    ])

    if (isError(output)) {
      return output
    }

    const parsedOutput = ffprobeOutputValidator.safeParse(JSON.parse(output))

    if (!parsedOutput.success) {
      return new ValidationError({ details: JSON.stringify(z.treeifyError(parsedOutput.error)) })
    }

    return { duration: parsedOutput.data.format?.duration, streams: parsedOutput.data.streams }
  }

  execute(...command: string[]) {
    return spawnPromise('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...command])
  }
}
