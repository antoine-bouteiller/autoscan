import type { FfprobeStream } from '@/schemas/ffmpeg'
import { type ISOCode1 } from '@/types/iso_codes'

import { type Criteria, isStreamWanted } from './utils'

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

export const processSubtitleStreams = (subtitleStreams: FfprobeStream[], originalLanguage: ISOCode1, _mediaTitle: string) => {
  const subtitlesToKeep: { index: number; language: ISOCode1 }[] = []
  if (originalLanguage === 'fr' || subtitleStreams.length === 0) {
    return []
  }

  let subtitleStreamToKeep = -1

  for (const criteria of criterias) {
    for (const condition of criteria) {
      subtitleStreamToKeep = subtitleStreams.findIndex(isStreamWanted(condition))
      if (subtitleStreamToKeep !== -1) {
        const stream = subtitleStreams[subtitleStreamToKeep]

        const language = stream?.tags?.language ?? 'en'
        subtitlesToKeep.push({ index: subtitleStreamToKeep, language: language as ISOCode1 })

        subtitleStreamToKeep = -1
        break
      }
    }
  }

  return subtitlesToKeep
}
