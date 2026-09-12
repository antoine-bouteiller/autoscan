import { Effect, FileSystem, Result } from 'effect'

import { nativeLogger } from '@/config/logger'
import { type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'
import { type ISOCode1 } from '@/shared/types/iso_codes'
import { isForcedSubtitleContent } from '@/shared/utils/subtitle'

import { isStreamWanted, type Criteria } from './utils.js'

export const isForcedSubtitle = (srtFilePath: string, mediaDuration: number) =>
  Effect.gen(function* () {
    if (mediaDuration <= 0) {
      return false
    }

    const fs = yield* FileSystem.FileSystem
    const read = yield* Effect.result(fs.readFileString(srtFilePath))
    return Result.isFailure(read) ? false : isForcedSubtitleContent(read.success, mediaDuration)
  })

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

const forcedFrenchCriterias: Criteria[][] = [
  [
    {
      include: ['forced'],
      language: 'fr',
      wantedEncodings: wantedSubtitleEncodings,
    },
  ],
]

const findMatchingStreams = (
  subtitleStreams: FFprobeStream[],
  criteriaGroups: Criteria[][],
  fallbackLanguage: ISOCode1
): { index: number; language: ISOCode1 }[] => {
  const results: { index: number; language: ISOCode1 }[] = []

  for (const criteria of criteriaGroups) {
    for (const condition of criteria) {
      const idx = subtitleStreams.findIndex(isStreamWanted(condition))
      if (idx !== -1) {
        const stream = subtitleStreams[idx]
        results.push({ index: idx, language: stream?.tags?.language ?? fallbackLanguage })
        break
      }
    }
  }

  return results
}

export const processSubtitleStreams = (subtitleStreams: FFprobeStream[], originalLanguage: ISOCode1, mediaTitle: string) => {
  if (subtitleStreams.length === 0) {
    return []
  }

  if (originalLanguage === 'fr') {
    const kept = findMatchingStreams(subtitleStreams, forcedFrenchCriterias, 'fr')
    if (kept.length > 0) {
      nativeLogger.info(`Forced French subtitle extracted`, 'Subtitle', mediaTitle)
    }
    return kept
  }

  const kept = findMatchingStreams(subtitleStreams, criterias, 'en')
  nativeLogger.info(`Subtitle extracted`, 'Subtitle', mediaTitle)
  return kept
}
