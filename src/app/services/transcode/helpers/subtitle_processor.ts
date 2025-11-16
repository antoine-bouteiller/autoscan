import { executeFfmpeg } from '@/app/integrations/ffmpeg/ffmpeg_client'
import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import { logger } from '@/config/logger'
import type { iso2 } from '@/types/iso_codes'
import { isStreamWanted, type Criteria } from './utils'

const wantedSubtitleEncodings = ['subrip', 'ass']

const criterias: Criteria[] = [
  { exclude: ['forced', 'sdh'], language: 'eng', wantedEncodings: wantedSubtitleEncodings },
  { exclude: ['forced'], language: 'eng', wantedEncodings: wantedSubtitleEncodings },
  { language: 'und', wantedEncodings: wantedSubtitleEncodings },
]

export const processSubtitleStreams = async (
  file: string,
  fileName: string,
  subtitleStreams: FFprobeStream[],
  originalLanguage: iso2,
  mediaTitle: string
): Promise<boolean> => {
  if (originalLanguage === 'fre' || subtitleStreams.length === 0) {
    return false
  }

  let subtitleStreamToKeep = -1
  for (const condition of criterias) {
    subtitleStreamToKeep = subtitleStreams.findIndex(isStreamWanted(condition))
    if (subtitleStreamToKeep !== -1) {
      break
    }
  }

  if (subtitleStreamToKeep === -1) {
    return false
  }

  const stream = subtitleStreams[subtitleStreamToKeep]

  const language = stream?.tags?.language?.toLowerCase() ?? 'eng'

  logger.info(`[${mediaTitle}] Extracting subtitles`)

  await executeFfmpeg(file, `${fileName}.${language}.srt`, [
    `-map 0:s:${subtitleStreamToKeep}`,
    `-c:s:${subtitleStreamToKeep} srt`,
  ])

  logger.info(`[${mediaTitle}] Subtitle extracted`)

  return true
}
