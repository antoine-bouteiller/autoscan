import { Function } from 'effect'

const FORCED_SUBTITLE_LPM_THRESHOLD = 3
const FORCED_SUBTITLE_SCREEN_RATIO_THRESHOLD = 0.15
const SYNC_THRESHOLD_MS = 300

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

  const blocks = content.trim().split(/\n\n+/)
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

export const parseStartTimestamps = (content: string): number[] => {
  const timestamps: number[] = []
  for (const block of content.trim().split(/\n\n+/)) {
    const match = /(?<start>\d{2}:\d{2}:\d{2},\d{3})\s*-->/.exec(block)
    if (match?.groups !== undefined) {
      timestamps.push(parseTimestampMs(match.groups['start']))
    }
  }
  return timestamps
}

export const areSubtitlesOutOfSync = Function.dual<
  (contentB: string) => (contentA: string) => boolean,
  (contentA: string, contentB: string) => boolean
>(2, (contentA, contentB) => {
  const timestampsA = parseStartTimestamps(contentA)
  const timestampsB = parseStartTimestamps(contentB)
  const length = Math.min(timestampsA.length, timestampsB.length)
  if (length === 0) {
    return false
  }

  let outOfSync = 0
  for (let index = 0; index < length; index++) {
    if (Math.abs(timestampsA[index] - timestampsB[index]) > SYNC_THRESHOLD_MS) {
      outOfSync++
    }
  }
  return outOfSync / length > 0.5
})
