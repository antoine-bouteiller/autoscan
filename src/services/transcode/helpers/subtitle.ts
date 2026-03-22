import { readFileSync } from 'node:fs'

import { logger } from '#config/logger'
import { type ISOCode1 } from '#types/iso_codes'
import type { FFprobeStream } from '#validators/ffmpeg.validator'

import { type Criteria, isStreamWanted } from './utils.js'

const FORCED_SUBTITLE_LPM_THRESHOLD = 3
const FORCED_SUBTITLE_SCREEN_RATIO_THRESHOLD = 0.15

const parseSrtTimestamp = (timestamp: string): number => {
  const [h, m, rest] = timestamp.split(':')
  const [s, ms] = rest.split(',')
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

export const isForcedSubtitle = (srtFilePath: string, mediaDuration: number): boolean => {
  if (mediaDuration <= 0) {
    return false
  }

  const content = readFileSync(srtFilePath, 'utf8')
  const blocks = content.trim().split(/\n\n+/)

  let totalScreenTime = 0

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) {
      continue
    }

    const timecodeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/)
    if (timecodeMatch) {
      totalScreenTime += parseSrtTimestamp(timecodeMatch[2]) - parseSrtTimestamp(timecodeMatch[1])
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

export const processSubtitleStreams = async (subtitleStreams: FFprobeStream[], originalLanguage: ISOCode1, mediaTitle: string) => {
  const subtitlesToKeep: { index: number; language: ISOCode1 }[] = []
  if (subtitleStreams.length === 0) {
    return []
  }

  if (originalLanguage === 'fr') {
    for (const criteria of forcedFrenchCriterias) {
      for (const condition of criteria) {
        const idx = subtitleStreams.findIndex(isStreamWanted(condition))
        if (idx !== -1) {
          const stream = subtitleStreams[idx]
          subtitlesToKeep.push({
            index: idx,
            language: stream?.tags?.language ?? 'fr',
          })
          break
        }
      }
    }

    if (subtitlesToKeep.length > 0) {
      logger.info(`Forced French subtitle extracted`, 'Subtitle', mediaTitle)
    }

    return subtitlesToKeep
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

  logger.info(`Subtitle extracted`, 'Subtitle', mediaTitle)

  return subtitlesToKeep
}
