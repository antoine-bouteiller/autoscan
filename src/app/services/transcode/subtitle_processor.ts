import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import type { iso2 } from '@/types/iso_codes'
import { executeFfmpeg } from '@/app/services/infrastructure/ffmpeg_service'
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

const wantedSubtitleEncodings = ['subrip', 'ass']

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

export class SubtitleProcessor {
  private shouldExecute = false

  constructor(
    private file: string,
    private fileName: string,
    private subtitleStreams: FFprobeStream[],
    private originalLanguage: iso2,
    private mediaTitle: string
  ) {}

  async process(): Promise<boolean> {
    const criterias: Criteria[] = [
      { exclude: ['forced', 'sdh'], language: 'eng', wantedEncodings: wantedSubtitleEncodings },
      { exclude: ['forced'], language: 'eng', wantedEncodings: wantedSubtitleEncodings },
      { language: 'und', wantedEncodings: wantedSubtitleEncodings },
    ]

    if (this.originalLanguage === 'fre' || this.subtitleStreams.length === 0) {
      return false
    }

    if (this.subtitleStreams.length > 0) {
      this.shouldExecute = true
    }

    let subtitleStreamToKeep = -1
    for (const condition of criterias) {
      subtitleStreamToKeep = this.subtitleStreams.findIndex(isStreamWanted(condition))
      if (subtitleStreamToKeep !== -1) {
        break
      }
    }

    if (subtitleStreamToKeep === -1) {
      return false
    }

    const stream = this.subtitleStreams[subtitleStreamToKeep]

    const language = stream?.tags?.language?.toLowerCase() ?? 'eng'

    logger.info(`[${this.mediaTitle}] Extracting subtitles`)

    await executeFfmpeg(this.file, `${this.fileName}.${language}.srt`, [
      `-map 0:s:${subtitleStreamToKeep}`,
      `-c:s:${subtitleStreamToKeep} srt`,
    ])

    this.shouldExecute = true

    logger.info(`[${this.mediaTitle}] Subtitle extracted`)

    return this.shouldExecute
  }
}
