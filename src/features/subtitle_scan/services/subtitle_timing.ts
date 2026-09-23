import { type SpeechActivity } from '@/integrations/ffmpeg/ffmpeg.service'
import { parseTimestampMs } from '@/shared/utils/subtitle'

const FRAME_SECONDS = 0.1
const WINDOW_SECONDS = 300
const SEARCH_FRAMES = 100
const TOLERANCE_FRAMES = 5
const MIN_ACTIVITY_FRAMES = 30
const ALIGNED_CORRELATION = 0.2
const MISALIGNED_CORRELATION = 0.1

type TimingVerdict = 'aligned' | 'misaligned' | 'inconclusive'
interface TimingWindow {
  readonly start: number
  readonly correlation: number
  readonly bestCorrelation: number
  readonly offset: number
  // `uncorrelated` may be a detector failure (noise, music), so it only counts as misalignment by majority.
  readonly verdict: TimingVerdict | 'uncorrelated'
}

interface TimingAssessment {
  readonly verdict: TimingVerdict
  readonly windows: TimingWindow[]
}

const parseIntervals = (content: string): [number, number][] | undefined => {
  const intervals: [number, number][] = []
  for (const block of content.trim().split(/\r?\n(?:\r?\n)+/)) {
    const match = /^(?<start>\d{2}:[0-5]\d:[0-5]\d,\d{3})\s*-->\s*(?<end>\d{2}:[0-5]\d:[0-5]\d,\d{3})(?:\s|$)/m.exec(block)
    if (match?.groups === undefined) {
      return undefined
    }
    const start = parseTimestampMs(match.groups['start']) / 1000
    const end = parseTimestampMs(match.groups['end']) / 1000
    if (end <= start) {
      return undefined
    }
    intervals.push([start, end])
  }
  return intervals
}

const toFrames = (intervals: readonly [number, number][], length: number) => {
  const frames = new Uint8Array(length)
  for (const [start, end] of intervals) {
    frames.fill(1, Math.min(length, Math.floor(start / FRAME_SECONDS)), Math.min(length, Math.ceil(end / FRAME_SECONDS)))
  }
  return frames
}

const assessWindow = (subtitles: Uint8Array, speech: Uint8Array, start: number): TimingWindow => {
  const end = Math.min(subtitles.length, start + WINDOW_SECONDS / FRAME_SECONDS)
  // Pearson correlation of binary activity (phi). Raw overlap would reward unrelated dialogue-heavy tracks.
  const correlation = (offset: number) => {
    let subtitleCount = 0
    let speechCount = 0
    let overlap = 0
    for (let frame = start; frame < end; frame++) {
      const subtitle = subtitles[frame]
      const voice = speech[frame + offset] ?? 0
      subtitleCount += subtitle
      speechCount += voice
      overlap += subtitle * voice
    }
    const length = end - start
    if (Math.min(subtitleCount, speechCount, length - subtitleCount, length - speechCount) < MIN_ACTIVITY_FRAMES) {
      return undefined
    }
    return (
      (length * overlap - subtitleCount * speechCount) / Math.sqrt(subtitleCount * speechCount * (length - subtitleCount) * (length - speechCount))
    )
  }
  let aligned: number | undefined
  let best = -Infinity
  let bestOffset = 0
  for (let offset = -SEARCH_FRAMES; offset <= SEARCH_FRAMES; offset++) {
    const score = correlation(offset)
    if (score === undefined) {
      continue
    }
    if (Math.abs(offset) <= TOLERANCE_FRAMES) {
      aligned = Math.max(aligned ?? -Infinity, score)
    }
    if (score > best || (score === best && Math.abs(offset) < Math.abs(bestOffset))) {
      best = score
      bestOffset = offset
    }
  }
  if (aligned === undefined) {
    return { bestCorrelation: 0, correlation: 0, offset: 0, start: start * FRAME_SECONDS, verdict: 'inconclusive' }
  }
  const shifted = best >= ALIGNED_CORRELATION && best - aligned >= MISALIGNED_CORRELATION
  let verdict: TimingWindow['verdict'] = 'inconclusive'
  if (shifted) {
    verdict = 'misaligned'
  } else if (best < MISALIGNED_CORRELATION) {
    verdict = 'uncorrelated'
  } else if (aligned >= ALIGNED_CORRELATION) {
    verdict = 'aligned'
  }
  return { bestCorrelation: best, correlation: aligned, offset: bestOffset * FRAME_SECONDS, start: start * FRAME_SECONDS, verdict }
}

export const assessSubtitleTiming = (content: string, activity: SpeechActivity): TimingAssessment => {
  const intervals = parseIntervals(content)
  if (intervals === undefined || !Number.isFinite(activity.duration) || activity.duration <= 0) {
    return { verdict: 'inconclusive', windows: [] }
  }
  const length = Math.ceil(activity.duration / FRAME_SECONDS)
  const subtitles = toFrames(intervals, length)
  const speech = toFrames(activity.intervals, length)
  const windows: TimingWindow[] = []
  for (let start = 0; start < length; start += WINDOW_SECONDS / FRAME_SECONDS) {
    const end = Math.min(length, start + WINDOW_SECONDS / FRAME_SECONDS)
    const cueCount = intervals.filter(([cueStart, cueEnd]) => cueStart < end * FRAME_SECONDS && cueEnd > start * FRAME_SECONDS).length
    if (cueCount === 0) {
      continue
    }
    windows.push(
      cueCount < 5
        ? { bestCorrelation: 0, correlation: 0, offset: 0, start: start * FRAME_SECONDS, verdict: 'inconclusive' }
        : assessWindow(subtitles, speech, start)
    )
  }
  if (windows.every((window) => window.verdict === 'inconclusive')) {
    return { verdict: 'inconclusive', windows }
  }
  const subtitleDuration = intervals.reduce((total, [start, end]) => total + end - start, 0)
  const outsideDuration = intervals.reduce((total, [start, end]) => total + Math.max(0, end - Math.max(start, activity.duration)), 0)
  const count = (verdict: TimingWindow['verdict']) => windows.filter((window) => window.verdict === verdict).length
  if (outsideDuration / subtitleDuration > 0.1 || count('misaligned') > 0 || count('uncorrelated') > count('aligned')) {
    return { verdict: 'misaligned', windows }
  }
  return { verdict: windows.every((window) => window.verdict === 'aligned') ? 'aligned' : 'inconclusive', windows }
}
