import { ArkErrors } from 'arktype'
import { mkdirSync } from 'node:fs'

import { ffprobeOutputValidator } from '@/app/validators/ffprobe_validator'
import { execPromise } from '@/utils/exec_promisify'

export const executeFfmpeg = (id: number, input: string, output: string, command: string[]) => {
  const path = input.split('/')
  path.pop()

  mkdirSync(`${path.join('/')}/transcode/${id}`, { recursive: true })

  return ffmpeg(`-i "${input}"`, ...command, `"${path.join('/')}/transcode/${id}/${output}"`)
}

export const ffprobe = async (input: string) => {
  const output = await execPromise(
    `ffprobe -loglevel error -show_entries stream=index,codec_name,codec_type,channels,sample_rate:stream_tags=language -print_format json "${input}"`
  )

  const parsedOutput = ffprobeOutputValidator(JSON.parse(output))

  if (parsedOutput instanceof ArkErrors) {
    throw new Error(`ffprobe output validation failed: ${parsedOutput.summary}`)
  }

  return parsedOutput.streams
}

const ffmpeg = (...command: string[]) => {
  const commandString = ['ffmpeg -hide_banner -loglevel error -y', ...command].join(' ')

  return execPromise(commandString)
}

export default ffmpeg
