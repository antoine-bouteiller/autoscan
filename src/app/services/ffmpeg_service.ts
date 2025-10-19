import { mkdirSync } from 'fs'

import { ffprobeOutputValidator } from '@/app/validators/ffprobe_validator'
import { execPromise } from '@/utils/exec_promisify'

export async function executeFfmpeg(input: string, output: string, command: string[]) {
  const path = input.split('/')
  path.pop()

  mkdirSync(`${path.join('/')}/transcode`, { recursive: true })

  return ffmpeg(`-i "${input}"`, ...command, `"${path.join('/')}/transcode/${output}"`)
}

export async function ffprobe(input: string) {
  const output = await execPromise(
    `ffprobe -loglevel error -show_entries stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language -print_format json "${input}"`
  )

  const parsedOutput = ffprobeOutputValidator.parse(JSON.parse(output))

  return parsedOutput.streams
}

function ffmpeg(...command: string[]) {
  const commandString = ['ffmpeg -hide_banner -loglevel error', ...command].join(' ')

  return execPromise(commandString)
}

export default ffmpeg
