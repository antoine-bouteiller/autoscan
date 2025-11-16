import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import { logger } from '@/config/logger'
import type { iso2 } from '@/types/iso_codes'

type Criteria =
  | {
      exclude?: string[]
      language: iso2
      wantedEncodings?: string[]
    }
  | {
      language: 'und'
      wantedEncodings?: string[]
    }

const wantedAudioEncodings = ['aac', 'ac3', 'eac3']

const isStreamWanted = (criteria: Criteria) => (stream: FFprobeStream) => {
  if (criteria.language === 'und') {
    return stream.tags?.language === undefined || stream.tags.language.toLowerCase() === 'und'
  }
  return (
    stream.tags?.language?.toLowerCase() === criteria.language &&
    (!criteria.exclude?.length ||
      !criteria.exclude.some((term) => stream.tags?.title?.toLowerCase().includes(term))) &&
    (!criteria.wantedEncodings?.length ||
      (stream.codec_name && criteria.wantedEncodings.includes(stream.codec_name.toLowerCase())))
  )
}

export const processAudioStreams = (
  audioStreams: FFprobeStream[],
  originalLanguage: iso2,
  mediaTitle: string
): { command: string[]; shouldExecute: boolean } => {
  const command: string[] = []
  let shouldExecute = false

  const criterias: Criteria[][] = [
    [
      { language: originalLanguage, wantedEncodings: wantedAudioEncodings },
      { language: 'und', wantedEncodings: wantedAudioEncodings },
      { language: originalLanguage },
      { language: 'und' },
    ],
  ]

  if (originalLanguage !== 'eng' && originalLanguage !== 'fre') {
    criterias.push([
      { language: 'eng', wantedEncodings: wantedAudioEncodings },
      { language: 'eng' },
    ])
  }

  if (originalLanguage !== 'fre') {
    criterias.push([
      { language: 'fre', wantedEncodings: wantedAudioEncodings },
      { language: 'fre' },
    ])
  }

  let countAudioStreamToKeep = 0

  for (const languageCriteria of criterias) {
    let audioStreamToKeep = -1
    for (const condition of languageCriteria) {
      audioStreamToKeep = audioStreams.findIndex(isStreamWanted(condition))
      if (audioStreamToKeep !== -1) {
        break
      }
    }

    if (audioStreamToKeep >= 0) {
      const stream = audioStreams[audioStreamToKeep]
      command.push(`-map 0:a:${audioStreamToKeep}`)
      countAudioStreamToKeep++

      const codec = stream?.codec_name?.toLowerCase()

      if (!codec || !wantedAudioEncodings.includes(codec)) {
        command.push(`-c:a:${audioStreamToKeep} aac`)

        shouldExecute = true

        logger.warn(
          `[${mediaTitle}] ${languageCriteria[0]?.language} audio stream 0:a:${audioStreamToKeep} is ${codec}, converting to aac.`
        )
      }

      if (stream?.tags?.language === undefined || stream.tags.language.toLowerCase() === 'und') {
        command.push(`-metadata:s:a:${audioStreamToKeep} language=${originalLanguage}`)
        shouldExecute = true
      }
    }
  }

  if (audioStreams.length === 0) {
    throw new Error(`[${mediaTitle}] No audio streams found for language ${originalLanguage}`)
  }

  if (countAudioStreamToKeep === 0) {
    throw new Error(
      `[${mediaTitle}] No audio tracks would be kept after processing. Blocking transcode.`
    )
  }

  if (countAudioStreamToKeep !== audioStreams.length) {
    shouldExecute = true
  }

  return { command, shouldExecute }
}
