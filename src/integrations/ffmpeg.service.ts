import { mkdirSync } from 'node:fs'

import * as v from 'valibot'

import { ValidationError } from '@/errors/validation'
import { spawnPromise } from '@/utils/exec_promisify'
import { ffprobeOutputValidator } from '@/validators/ffmpeg.validator'

export class FfmpegClient {
  executeFfmpeg(id: number, input: string, output: string, command: string[]) {
    const path = input.split('/')
    path.pop()

    mkdirSync(`${path.join('/')}/transcode/${id}`, { recursive: true })

    return spawnPromise('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      ...command,
      `${path.join('/')}/transcode/${id}/${output}`,
    ])
  }

  async ffprobe(input: string) {
    const output = await spawnPromise('ffprobe', [
      '-loglevel',
      'error',
      '-show_entries',
      'stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language',
      '-print_format',
      'json',
      input,
    ])

    const parsedOutput = v.safeParse(ffprobeOutputValidator, JSON.parse(output))

    if (!parsedOutput.success) {
      throw new ValidationError(parsedOutput.issues)
    }

    return parsedOutput.output.streams
  }

  execute(...command: string[]) {
    return spawnPromise('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...command])
  }
}
