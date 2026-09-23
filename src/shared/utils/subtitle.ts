import { Function } from 'effect'

const FORCED_SUBTITLE_LPM_THRESHOLD = 3
const FORCED_SUBTITLE_SCREEN_RATIO_THRESHOLD = 0.15
const SYNC_THRESHOLD_MS = 500

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

export const parseStartTimestamps = (content: string): number[] => {
  const timestamps: number[] = []
  for (const block of content.trim().split(/\r?\n(?:\r?\n)+/)) {
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
  const timestampsA = parseStartTimestamps(contentA).toSorted((left, right) => left - right)
  const timestampsB = parseStartTimestamps(contentB).toSorted((left, right) => left - right)
  const length = Math.min(timestampsA.length, timestampsB.length)
  if (length === 0) {
    return false
  }

  let matched = 0
  let indexA = 0
  let indexB = 0
  while (indexA < timestampsA.length && indexB < timestampsB.length) {
    const difference = timestampsA[indexA] - timestampsB[indexB]
    if (Math.abs(difference) <= SYNC_THRESHOLD_MS) {
      matched++
      indexA++
      indexB++
    } else if (difference < 0) {
      indexA++
    } else {
      indexB++
    }
  }
  return matched / length < 0.5
})
