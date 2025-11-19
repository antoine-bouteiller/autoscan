import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import { logger } from '@/config/logger'
import { type ISOCode1 } from '@/types/iso_codes'
import { isStreamWanted, type Criteria } from './utils'

const wantedSubtitleEncodings = ['subrip', 'ass']

const criterias: Criteria[][] = [
  [
    {
      exclude: ['forced', 'sdh'],
      language: 'en',
      wantedEncodings: wantedSubtitleEncodings,
    },
    {
      exclude: ['forced'],
      language: 'en',
      wantedEncodings: wantedSubtitleEncodings,
    },
    { language: 'und', wantedEncodings: wantedSubtitleEncodings },
  ],
  [
    {
      exclude: ['forced', 'sdh'],
      language: 'fr',
      wantedEncodings: wantedSubtitleEncodings,
    },
    {
      exclude: ['forced'],
      language: 'fr',
      wantedEncodings: wantedSubtitleEncodings,
    },
  ],
]

export const processSubtitleStreams = async (
  subtitleStreams: FFprobeStream[],
  originalLanguage: ISOCode1,
  mediaTitle: string
) => {
  const subtitlesToKeep: { language: ISOCode1; index: number }[] = []
  if (originalLanguage === 'fr' || subtitleStreams.length === 0) {
    return []
  }

  let subtitleStreamToKeep = -1

  for (const criteria of criterias) {
    for (const condition of criteria) {
      subtitleStreamToKeep = subtitleStreams.findIndex(isStreamWanted(condition))
      if (subtitleStreamToKeep !== -1) {
        const stream = subtitleStreams[subtitleStreamToKeep]

        subtitlesToKeep.push({
          index: subtitleStreamToKeep,
          language: stream?.tags?.language ?? 'en',
        })

        subtitleStreamToKeep = -1
        break
      }
    }
  }

  logger.info(`[${mediaTitle}] Subtitle extracted`)

  return subtitlesToKeep
}
