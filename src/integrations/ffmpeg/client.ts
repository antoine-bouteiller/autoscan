import { ArkErrors } from 'arktype'
import { mkdirSync } from 'node:fs'

import { spawnPromise } from '@/utils/exec_promisify'

import { ffprobeOutputValidator } from './validator'

export const executeFfmpeg = (id: number, input: string, output: string, command: string[]) => {
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

export const ffprobe = async (input: string) => {
  const output = await spawnPromise('ffprobe', [
    '-loglevel',
    'error',
    '-show_entries',
    'stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language',
    '-print_format',
    'json',
    input,
  ])

  const parsedOutput = ffprobeOutputValidator(JSON.parse(output))

  if (parsedOutput instanceof ArkErrors) {
    throw new TypeError(`(ffprobe) output validation failed: ${parsedOutput.summary}`)
  }

  return parsedOutput.streams
}

const ffmpeg = (...command: string[]) =>
  spawnPromise('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...command])

export default ffmpeg
