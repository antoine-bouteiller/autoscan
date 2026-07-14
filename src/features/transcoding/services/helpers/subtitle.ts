import { logger } from '@/config/logger'
import { type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'
import { type ISOCode1 } from '@/shared/types/iso_codes'
import { safeReadFileSync } from '@/shared/utils/fs'

import { isStreamWanted, type Criteria } from './utils.js'

const FORCED_SUBTITLE_LPM_THRESHOLD = 3
const FORCED_SUBTITLE_SCREEN_RATIO_THRESHOLD = 0.15

const parseSrtTimestamp = (timestamp: string): number => {
  const [hours, minutes, rest] = timestamp.split(':')
  const [seconds, ms] = rest.split(',')
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(ms) / 1000
}

export const isForcedSubtitle = (srtFilePath: string, mediaDuration: number): boolean => {
  if (mediaDuration <= 0) {
    return false
  }

  const content = safeReadFileSync(srtFilePath)
  if (content instanceof Error) {
    return false
  }
  const blocks = content.trim().split(/\n\n+/)

  let totalScreenTime = 0

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) {
      continue
    }

    const timecodeMatch = /(?<start>\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(?<end>\d{2}:\d{2}:\d{2},\d{3})/.exec(lines[1])
    if (timecodeMatch?.groups) {
      totalScreenTime += parseSrtTimestamp(timecodeMatch.groups['end']) - parseSrtTimestamp(timecodeMatch.groups['start'])
    }
  }

  const durationMinutes = mediaDuration / 60
  const fewLines = blocks.length / durationMinutes < FORCED_SUBTITLE_LPM_THRESHOLD
  const lowScreenTime = totalScreenTime / mediaDuration < FORCED_SUBTITLE_SCREEN_RATIO_THRESHOLD

  return fewLines || lowScreenTime
}

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

export const processSubtitleStreams = async (subtitleStreams: FFprobeStream[], originalLanguage: ISOCode1, mediaTitle: string) => {
  if (subtitleStreams.length === 0) {
    return []
  }

  if (originalLanguage === 'fr') {
    const kept = findMatchingStreams(subtitleStreams, forcedFrenchCriterias, 'fr')
    if (kept.length > 0) {
      logger.info(`Forced French subtitle extracted`, 'Subtitle', mediaTitle)
    }
    return kept
  }

  const kept = findMatchingStreams(subtitleStreams, criterias, 'en')
  logger.info(`Subtitle extracted`, 'Subtitle', mediaTitle)
  return kept
}
