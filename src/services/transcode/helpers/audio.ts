import { logger } from '#config/logger'
import { AudioStreamNotFoundError, NoStreamsKeptError } from '#errors/transcode'
import { type ISOCode1 } from '#types/iso_codes'
import { iso1ToIso2B } from '#utils/iso_codes'
import { type FFprobeStream } from '#validators/ffmpeg.validator'

import { isStreamWanted, type Criteria } from './utils.js'

const wantedAudioEncodings = ['aac', 'ac3', 'eac3']

const getCriterias = (originalLanguage: ISOCode1) => {
  const criterias: Criteria[][] = [
    [
      { language: originalLanguage, wantedEncodings: wantedAudioEncodings },
      { language: 'und', wantedEncodings: wantedAudioEncodings },
      { language: originalLanguage },
      { language: 'und' },
    ],
  ]

  if (originalLanguage !== 'en' && originalLanguage !== 'fr') {
    criterias.push([{ language: 'en', wantedEncodings: wantedAudioEncodings }, { language: 'en' }])
  }

  if (originalLanguage !== 'fr') {
    criterias.push([{ language: 'fr', wantedEncodings: wantedAudioEncodings }, { language: 'fr' }])
  }

  return criterias
}

const findAudioStreamByCriteria = (audioStreams: FFprobeStream[], languageCriteria: Criteria[]): number => {
  for (const condition of languageCriteria) {
    const streamIndex = audioStreams.findIndex(isStreamWanted(condition))
    if (streamIndex !== -1) {
      return streamIndex
    }
  }
  return -1
}

const processAudioStream = (
  stream: FFprobeStream,
  streamIndex: number,
  params: { languageCriteria: Criteria[]; originalLanguage: ISOCode1; mediaTitle: string }
): { commands: string[]; needsTranscode: boolean } => {
  const { languageCriteria, originalLanguage, mediaTitle } = params
  const commands: string[] = [`-map`, `0:a:${streamIndex}`]
  let needsTranscode = false

  const codec = stream?.codec_name?.toLowerCase()

  if (!codec || !wantedAudioEncodings.includes(codec)) {
    commands.push(`-c:a:${streamIndex}`, 'aac')
    needsTranscode = true
    logger.warn(`${languageCriteria[0]?.language} audio stream 0:a:${streamIndex} is ${codec}, converting to aac.`, 'Audio', mediaTitle)
  }

  if (stream?.tags?.language === undefined || stream.tags.language.toLowerCase() === 'und') {
    const iso2BCode = iso1ToIso2B(originalLanguage)
    commands.push(`-metadata:s:a:${streamIndex}`, `language=${iso2BCode}`)
    needsTranscode = true
  }

  return { commands, needsTranscode }
}

export const processAudioStreams = (
  audioStreams: FFprobeStream[],
  originalLanguage: ISOCode1,
  mediaTitle: string
): AudioStreamNotFoundError | NoStreamsKeptError | { command: string[]; shouldExecute: boolean } => {
  if (audioStreams.length === 0) {
    return new AudioStreamNotFoundError({ language: originalLanguage, mediaTitle })
  }

  const command: string[] = []
  let shouldExecute = false
  let countAudioStreamToKeep = 0

  const criterias = getCriterias(originalLanguage)

  for (const languageCriteria of criterias) {
    const audioStreamIndex = findAudioStreamByCriteria(audioStreams, languageCriteria)

    if (audioStreamIndex >= 0) {
      const stream = audioStreams[audioStreamIndex]
      if (!stream) {
        continue
      }
      const result = processAudioStream(stream, audioStreamIndex, { languageCriteria, mediaTitle, originalLanguage })
      command.push(...result.commands)
      countAudioStreamToKeep++

      if (result.needsTranscode) {
        shouldExecute = true
      }
    }
  }

  if (countAudioStreamToKeep === 0) {
    return new NoStreamsKeptError({ mediaTitle })
  }

  if (countAudioStreamToKeep !== audioStreams.length) {
    shouldExecute = true
  }

  return { command, shouldExecute }
}
