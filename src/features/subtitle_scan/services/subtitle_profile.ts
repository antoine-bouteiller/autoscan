/* oxlint-disable devkit/no-low-signal-symbol-names, unicorn/no-null */
import {
  AGREE_TOLERANCE,
  ANCHOR_VOTE_WEIGHT,
  COVERAGE_MAX_OVERRUN,
  COVERAGE_MIN_FRACTION,
  FRAMERATE_RATIOS,
  PEAK_EXCLUSION,
  PROFILE_BIN,
  PROFILE_MAX_OFFSET,
  PROFILE_MIN_CUES,
  PROFILE_SEGMENTS,
  PROFILE_SMOOTH,
  REPAIR_MAX_OFFSET,
  REPAIR_MAX_RESIDUAL,
  REPAIR_RATIO,
  SEGMENT_PEAK_RATIO,
  SEGMENT_SUPPORT_MIN,
  UNRELATED_MAX_SUPPORT,
} from '@/features/subtitle_scan/constants'

export interface Cue {
  start: number
  end: number
  anchors: readonly string[]
}
export type PairShape = 'agree' | 'constant' | 'linear' | 'piecewise' | 'unrelated' | 'undetermined'
export interface Fit {
  offset: number
  ratio: number
  residual: number
}
export interface PairProfile {
  shape: PairShape
  segments: readonly { start: number; end: number; offset: number | null; support: number }[]
  fit: Fit | null
}
const tokenPattern = /[\p{L}\p{N}][\p{L}\p{N}_'’-]*/gu
const sentenceEnd = /[.!?…:]['"»”)]*\s*$/u
const cueAnchors = (lines: readonly string[]): string[] => {
  const found: string[] = []
  let initial = true
  for (const raw of lines) {
    let line = raw.replaceAll(/<[^>]*>|\{[^}]*\}|[♪♫]/gu, '').trim()
    if (line.startsWith('-')) {
      line = line.replace(/^[- ]+/u, '')
      initial = true
    }
    for (const match of line.matchAll(tokenPattern)) {
      const prefix = line.slice(0, match.index)
      const word = match[0].replace(/['’]s$/u, '')
      const sentenceInitial = (initial && !/[\p{L}\p{N}]/u.test(prefix)) || sentenceEnd.test(prefix)
      const capital = /^\p{Lu}/u.test(word) && word.length > 1 && !/^I['’]/u.test(word)
      if (/^\p{Nd}+$/u.test(word) || (capital && !sentenceInitial)) {
        found.push(word.toLowerCase())
      }
    }
    initial = sentenceEnd.test(line)
  }
  return found
}
const timestamp = (value: string) => {
  const parts = value.split(/[:,.]/u).map(Number)
  return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / 1000
}
const parseBlock = (block: string): Cue | null => {
  const lines = block.trim().split('\n')
  for (const [index, line] of lines.entries()) {
    const match = /(?<start>\d+:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(?<end>\d+:\d{2}:\d{2}[,.]\d{3})/u.exec(line)
    if (match?.groups !== undefined) {
      const start = timestamp(match.groups['start'])
      const end = timestamp(match.groups['end'])
      return end > start ? { anchors: cueAnchors(lines.slice(index + 1)), end, start } : null
    }
  }
  return null
}
export const parseCues = (content: string): Cue[] =>
  content
    .replaceAll('\r\n', '\n')
    .split(/\n\s*\n/u)
    .map(parseBlock)
    .filter((cue) => cue !== null)
    .toSorted((left, right) => left.start - right.start || left.end - right.end)
type Segment = PairProfile['segments'][number]
const median = (values: readonly number[]) => {
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}
const histogram = (reference: readonly Cue[], track: readonly Cue[], ratio: number) => {
  const bins = new Float64Array(Math.round((2 * PROFILE_MAX_OFFSET) / PROFILE_BIN) + 1)
  let first = 0
  for (const cue of reference) {
    while (first < track.length && track[first].start / ratio < cue.start - PROFILE_MAX_OFFSET) {
      first++
    }
    for (let index = first; index < track.length; index++) {
      const other = track[index]
      const delta = other.start / ratio - cue.start
      if (delta > PROFILE_MAX_OFFSET) {
        break
      }
      const bin = Math.round((delta + PROFILE_MAX_OFFSET) / PROFILE_BIN)
      bins[bin] += 1 + (cue.anchors.some((anchor) => other.anchors.includes(anchor)) ? ANCHOR_VOTE_WEIGHT : 0)
    }
  }
  return bins
}
const smooth = (bins: Float64Array) => {
  const prefix = new Float64Array(bins.length + 1)
  for (let index = 0; index < bins.length; index++) {
    prefix[index + 1] = prefix[index] + bins[index]
  }
  const radius = Math.round(PROFILE_SMOOTH / PROFILE_BIN)
  return bins.map((_value, index) => prefix[Math.min(bins.length, index + radius + 1)] - prefix[Math.max(0, index - radius)])
}
const segmentPeak = (bins: Float64Array, count: number) => {
  const smoothed = smooth(bins)
  let best = Math.round(PROFILE_MAX_OFFSET / PROFILE_BIN)
  for (let index = 0; index < bins.length; index++) {
    if (smoothed[index] > smoothed[best] || (smoothed[index] === smoothed[best] && bins[index] > bins[best])) {
      best = index
    }
  }
  let runner = 0
  for (let index = 0; index < bins.length; index++) {
    if (Math.abs(index - best) * PROFILE_BIN > PEAK_EXCLUSION) {
      runner = Math.max(runner, smoothed[index])
    }
  }
  const support = smoothed[best] / count
  const determined = support >= SEGMENT_SUPPORT_MIN && smoothed[best] >= SEGMENT_PEAK_RATIO * runner
  return { offset: determined ? (best - Math.round(PROFILE_MAX_OFFSET / PROFILE_BIN)) * PROFILE_BIN : null, support }
}
const segmentOffsets =
  (reference: readonly Cue[], track: readonly Cue[], duration: number) =>
  (ratio: number): Segment[] =>
    Array.from({ length: PROFILE_SEGMENTS }, (_value, index) => {
      const start = (duration * index) / PROFILE_SEGMENTS
      const end = (duration * (index + 1)) / PROFILE_SEGMENTS
      const cues = reference.filter((cue) => cue.start >= start && cue.start < end)
      const peak = cues.length >= PROFILE_MIN_CUES ? segmentPeak(histogram(cues, track, ratio), cues.length) : { offset: null, support: 0 }
      return { end, start, ...peak }
    })
const determined = (segments: readonly Segment[]) => segments.filter((segment): segment is Segment & { offset: number } => segment.offset !== null)
// Residuals sit on a half-bin grid; rounding keeps float noise off the tolerance boundaries.
const residualOf = (value: number) => (Math.round(Math.abs(value) / (PROFILE_BIN / 2)) * PROFILE_BIN) / 2
/** One noisy segment may stray up to twice the agreement tolerance; a jump shared by several segments may not. */
const withinTolerance = (residuals: readonly number[], tolerance: number) =>
  residuals.length >= 3 &&
  residuals.every((residual) => residual <= 2 * AGREE_TOLERANCE) &&
  residuals.filter((residual) => residual > tolerance).length <= 1
const agrees = (segments: readonly Segment[]) =>
  withinTolerance(
    determined(segments).map((segment) => residualOf(segment.offset)),
    AGREE_TOLERANCE
  )
const stableFit = (segments: readonly Segment[], ratio: number): Fit | null => {
  const offsets = determined(segments).map((segment) => segment.offset)
  if (offsets.length < 3) {
    return null
  }
  const centre = median(offsets)
  const residuals = offsets.map((offset) => residualOf(offset - centre))
  return withinTolerance(residuals, REPAIR_MAX_RESIDUAL) ? { offset: ratio * centre, ratio, residual: Math.max(...residuals) } : null
}
const linearFit = (segments: readonly Segment[]): Fit | null => {
  const points = determined(segments).map((segment) => ({ offset: segment.offset, time: (segment.start + segment.end) / 2 }))
  if (points.length < 3) {
    return null
  }
  const meanTime = points.reduce((sum, point) => sum + point.time, 0) / points.length
  const meanOffset = points.reduce((sum, point) => sum + point.offset, 0) / points.length
  const slope =
    points.reduce((sum, point) => sum + (point.time - meanTime) * (point.offset - meanOffset), 0) /
    points.reduce((sum, point) => sum + (point.time - meanTime) ** 2, 0)
  const offset = meanOffset - slope * meanTime
  const residuals = points.map((point) => residualOf(point.offset - offset - slope * point.time))
  const ratio = 1 + slope
  return ratio >= REPAIR_RATIO[0] &&
    ratio <= REPAIR_RATIO[1] &&
    Math.abs(offset) <= REPAIR_MAX_OFFSET &&
    withinTolerance(residuals, REPAIR_MAX_RESIDUAL)
    ? { offset, ratio, residual: Math.max(...residuals) }
    : null
}
export const profilePair = (reference: readonly Cue[], track: readonly Cue[], durationSeconds: number): PairProfile => {
  const sortedReference = reference.toSorted((left, right) => left.start - right.start)
  const sortedTrack = track.toSorted((left, right) => left.start - right.start)
  const segments = segmentOffsets(sortedReference, sortedTrack, durationSeconds)(1)
  if (agrees(segments)) {
    return { fit: null, segments, shape: 'agree' }
  }
  const stable = stableFit(segments, 1)
  if (stable !== null) {
    return { fit: stable, segments, shape: 'constant' }
  }
  let any = determined(segments).length > 0
  for (const ratio of FRAMERATE_RATIOS) {
    if (ratio === 1) {
      continue
    }
    const scaled = segmentOffsets(sortedReference, sortedTrack, durationSeconds)(ratio)
    any ||= determined(scaled).length > 0
    const fit = stableFit(scaled, ratio)
    if (fit !== null) {
      return { fit, segments: scaled, shape: 'linear' }
    }
  }
  const fit = linearFit(segments)
  if (fit !== null) {
    return { fit, segments, shape: 'linear' }
  }
  if (determined(segments).length >= 3) {
    return { fit: null, segments, shape: 'piecewise' }
  }
  const eligible = segments.filter(
    (segment) => sortedReference.filter((cue) => cue.start >= segment.start && cue.start < segment.end).length >= PROFILE_MIN_CUES
  ).length
  const ambiguous = segments.some((segment) => segment.support >= UNRELATED_MAX_SUPPORT)
  return { fit: null, segments, shape: any || ambiguous || eligible < 3 ? 'undetermined' : 'unrelated' }
}
const hasCoverage = (cues: readonly Cue[], duration: number) => {
  const end = cues.reduce((last, cue) => Math.max(last, cue.end), 0)
  return end >= COVERAGE_MIN_FRACTION * duration && end <= duration + Math.max(COVERAGE_MAX_OVERRUN.seconds, COVERAGE_MAX_OVERRUN.fraction * duration)
}
export const passesCoverage = (reference: readonly Cue[], track: readonly Cue[], durationSeconds: number): boolean =>
  !hasCoverage(reference, durationSeconds) || hasCoverage(track, durationSeconds)
