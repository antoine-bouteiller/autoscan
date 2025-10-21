import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import type { iso2 } from '@/types/iso_codes'
import { logger } from '@/config/logger'

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

export class AudioProcessor {
  private command: string[] = []
  private shouldExecute = false

  constructor(
    private audioStreams: FFprobeStream[],
    private originalLanguage: iso2,
    private mediaTitle: string
  ) {}

  process(): { command: string[]; shouldExecute: boolean } {
    const criterias: Criteria[][] = [
      [
        { language: this.originalLanguage, wantedEncodings: wantedAudioEncodings },
        { language: 'und', wantedEncodings: wantedAudioEncodings },
        { language: this.originalLanguage },
        { language: 'und' },
      ],
    ]

    if (this.originalLanguage !== 'eng' && this.originalLanguage !== 'fre') {
      criterias.push([
        { language: 'eng', wantedEncodings: wantedAudioEncodings },
        { language: 'eng' },
      ])
    }

    if (this.originalLanguage !== 'fre') {
      criterias.push([
        { language: 'fre', wantedEncodings: wantedAudioEncodings },
        { language: 'fre' },
      ])
    }

    let countAudioStreamToKeep = 0

    for (const languageCriteria of criterias) {
      let audioStreamToKeep = -1
      for (const condition of languageCriteria) {
        audioStreamToKeep = this.audioStreams.findIndex(isStreamWanted(condition))
        if (audioStreamToKeep !== -1) {
          break
        }
      }

      if (audioStreamToKeep >= 0) {
        const stream = this.audioStreams[audioStreamToKeep]
        this.command.push(`-map 0:a:${audioStreamToKeep}`)
        countAudioStreamToKeep++

        const codec = stream?.codec_name?.toLowerCase()

        if (!codec || !wantedAudioEncodings.includes(codec)) {
          this.command.push(`-c:a:${audioStreamToKeep} aac`)

          this.shouldExecute = true

          logger.warn(
            `[${this.mediaTitle}] ${languageCriteria[0]?.language} audio stream 0:a:${audioStreamToKeep} is ${codec}, converting to aac.`
          )
        }

        if (stream?.tags?.language === undefined || stream.tags.language.toLowerCase() === 'und') {
          this.command.push(`-metadata:s:a:${audioStreamToKeep} language=${this.originalLanguage}`)
          this.shouldExecute = true
        }
      }
    }

    if (this.audioStreams.length === 0) {
      throw new Error(
        `[${this.mediaTitle}] No audio streams found for language ${this.originalLanguage}`
      )
    }

    if (countAudioStreamToKeep !== this.audioStreams.length) {
      this.shouldExecute = true
    }

    return { command: this.command, shouldExecute: this.shouldExecute }
  }
}
