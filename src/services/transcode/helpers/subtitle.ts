import { readFileSync } from 'node:fs'

import { logger } from '#config/logger'
import { type ISOCode1 } from '#types/iso_codes'
import type { FFprobeStream } from '#validators/ffmpeg.validator'

import { type Criteria, isStreamWanted } from './utils.js'

const FORCED_SUBTITLE_WPM_THRESHOLD = 15

export const isForcedSubtitle = (srtFilePath: string, mediaDuration: number): boolean => {
  if (mediaDuration <= 0) {
    return false
  }

  const content = readFileSync(srtFilePath, 'utf8')
  const blocks = content.trim().split(/\n\n+/)

  let totalWords = 0

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) {
      continue
    }

    const text = lines.slice(2).join(' ')
    const cleanText = text
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]+\}/g, '')
      .trim()
    if (cleanText) {
      totalWords += cleanText.split(/\s+/).length
    }
  }

  const durationMinutes = mediaDuration / 60
  return totalWords / durationMinutes < FORCED_SUBTITLE_WPM_THRESHOLD
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

export const processSubtitleStreams = async (subtitleStreams: FFprobeStream[], originalLanguage: ISOCode1, mediaTitle: string) => {
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
