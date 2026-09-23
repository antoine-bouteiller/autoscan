import { Function } from 'effect'

const FORCED_SUBTITLE_LPM_THRESHOLD = 3
const FORCED_SUBTITLE_SCREEN_RATIO_THRESHOLD = 0.15

const parseSrtTimestamp = (timestamp: string): number => {
  const [hours, minutes, rest] = timestamp.split(':')
  const [seconds, ms] = rest.split(',')
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(ms) / 1000
}

export const parseTimestampMs = (timestamp: string): number => {
  const [hours, minutes, rest] = timestamp.split(':')
  const [seconds, milliseconds] = rest.split(',')
  return Number(hours) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(milliseconds)
}

export const isForcedSubtitleContent = Function.dual<
  (durationSeconds: number) => (content: string) => boolean,
  (content: string, durationSeconds: number) => boolean
>(2, (content, durationSeconds) => {
  if (durationSeconds <= 0) {
    return false
  }

  const blocks = content.trim().split(/\r?\n(?:\r?\n)+/)
  let totalScreenTime = 0

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) {
      continue
    }

    const timecodeMatch = /(?<start>\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(?<end>\d{2}:\d{2}:\d{2},\d{3})/.exec(lines[1])
    if (timecodeMatch?.groups !== undefined) {
      totalScreenTime += parseSrtTimestamp(timecodeMatch.groups['end']) - parseSrtTimestamp(timecodeMatch.groups['start'])
    }
  }

  const durationMinutes = durationSeconds / 60
  const fewLines = blocks.length / durationMinutes < FORCED_SUBTITLE_LPM_THRESHOLD
  const lowScreenTime = totalScreenTime / durationSeconds < FORCED_SUBTITLE_SCREEN_RATIO_THRESHOLD

  return fewLines || lowScreenTime
})
