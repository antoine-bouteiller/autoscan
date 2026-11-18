/* oxlint-disable autoscan/no-shape-in-symbol-names, unicorn/no-null */
import {
  AGREE_TOLERANCE,
  ALIGNED_MIN_R,
  INFORMATIVE_MIN,
  MARGIN_MIN,
  PEAK_EXCLUSION,
  PEAK_MIN,
  REPAIR_MAX_OFFSET,
  REPAIR_MAX_RESIDUAL,
  REPAIR_RATIO,
  SPEECH_BIN,
  SPEECH_MAX_OFFSET,
  SPEECH_MIN_FRACTION,
  UNCOVERED_MIN,
} from '@/features/subtitle_scan/constants'
import { type Cue, type Fit } from '@/features/subtitle_scan/services/subtitle_profile'
import { type SpeechWindow } from '@/integrations/ffmpeg/ffmpeg.service'

export type TrackShape = 'aligned' | 'constant' | 'linear' | 'truncated' | 'uncorrectable' | 'inconclusive'
export interface TrackAssessment {
  shape: TrackShape
  fit: Fit | null
  windows: readonly ({ offset: number; atZero: number; peak: number; margin: number } | null)[]
}
type WindowAssessment = NonNullable<TrackAssessment['windows'][number]>
interface Point {
  time: number
  offset: number
}
const mask = (intervals: readonly (readonly [number, number])[], origin: number, length: number) => {
  const result = new Uint8Array(length)
  for (const [start, end] of intervals) {
    const first = Math.max(0, Math.ceil((start - origin) / SPEECH_BIN - 0.5))
    const last = Math.min(length, Math.ceil((end - origin) / SPEECH_BIN - 0.5))
    if (last > first) {
      result.fill(1, first, last)
    }
  }
  return result
}
const prefixSum = (values: Uint8Array) => {
  const prefix = new Uint32Array(values.length + 1)
  for (let index = 0; index < values.length; index++) {
    prefix[index + 1] = prefix[index] + values[index]
  }
  return prefix
}
const runs = (values: Uint8Array): (readonly [number, number])[] => {
  const result: (readonly [number, number])[] = []
  let first = -1
  for (let index = 0; index <= values.length; index++) {
    if (values[index] === 1 && first < 0) {
      first = index
    }
    if (values[index] !== 1 && first >= 0) {
      result.push([first, index])
      first = -1
    }
  }
  return result
}
const correlations = (speech: Uint8Array, cues: Uint8Array, speechCount: number) => {
  const prefix = prefixSum(cues)
  const spans = runs(speech)
  const { length } = speech
  const offsets = cues.length - length + 1
  const values = new Float64Array(offsets)
  for (let index = 0; index < offsets; index++) {
    const count = prefix[index + length] - prefix[index]
    if (count === 0 || count === length || speechCount === length) {
      continue
    }
    let overlap = 0
    for (const [start, end] of spans) {
      overlap += prefix[index + end] - prefix[index + start]
    }
    values[index] = (overlap * length - speechCount * count) / Math.sqrt(speechCount * (length - speechCount) * count * (length - count))
  }
  return values
}
const correlateWindow = (cues: readonly Cue[], window: SpeechWindow): WindowAssessment | null => {
  const length = Math.round(window.duration / SPEECH_BIN)
  const speech = mask(window.speech, window.start, length)
  const count = speech.reduce((sum, value) => sum + value, 0)
  if (length === 0 || count / length < SPEECH_MIN_FRACTION) {
    return null
  }
  const radius = Math.round(SPEECH_MAX_OFFSET / SPEECH_BIN)
  const cueMask = mask(
    cues.map((cue) => [cue.start, cue.end] as const),
    window.start - radius * SPEECH_BIN,
    length + 2 * radius
  )
  const values = correlations(speech, cueMask, count)
  let best = radius
  for (let index = 0; index < values.length; index++) {
    if (values[index] > values[best] || (values[index] === values[best] && Math.abs(index - radius) < Math.abs(best - radius))) {
      best = index
    }
  }
  let runner = -1
  for (let index = 0; index < values.length; index++) {
    if (Math.abs(index - best) * SPEECH_BIN > PEAK_EXCLUSION) {
      runner = Math.max(runner, values[index])
    }
  }
  return { atZero: values[radius], margin: values[best] - runner, offset: (best - radius) * SPEECH_BIN, peak: values[best] }
}
const pointOffset = (window: WindowAssessment): number | null => {
  if (window.atZero >= ALIGNED_MIN_R) {
    return 0
  }
  return window.peak >= PEAK_MIN && window.margin >= MARGIN_MIN ? window.offset : null
}
const refit = (points: readonly Point[]) => {
  const meanTime = points.reduce((sum, point) => sum + point.time, 0) / points.length
  const meanOffset = points.reduce((sum, point) => sum + point.offset, 0) / points.length
  const slope =
    points.reduce((sum, point) => sum + (point.time - meanTime) * (point.offset - meanOffset), 0) /
    points.reduce((sum, point) => sum + (point.time - meanTime) ** 2, 0)
  const offset = meanOffset - slope * meanTime
  const residual = Math.max(...points.map((point) => Math.abs(point.offset - offset - slope * point.time)))
  return { offset, ratio: 1 + slope, residual }
}
const constantFit = (points: readonly Point[], need: number): Fit | null => {
  for (const point of points.toSorted((left, right) => left.offset - right.offset)) {
    const neighbors = points
      .filter((other) => Math.abs(other.offset - point.offset) <= REPAIR_MAX_RESIDUAL)
      .map((other) => other.offset)
      .toSorted((left, right) => left - right)
    if (neighbors.length < need) {
      continue
    }
    const middle = Math.floor(neighbors.length / 2)
    const offset = neighbors.length % 2 === 0 ? (neighbors[middle - 1] + neighbors[middle]) / 2 : neighbors[middle]
    return { offset, ratio: 1, residual: Math.max(...neighbors.map((value) => Math.abs(value - offset))) }
  }
  return null
}
const lineThrough = (points: readonly Point[], first: Point, second: Point) => {
  if (first.time === second.time) {
    return []
  }
  const slope = (second.offset - first.offset) / (second.time - first.time)
  const offset = first.offset - slope * first.time
  return points.filter((point) => Math.abs(point.offset - offset - slope * point.time) <= REPAIR_MAX_RESIDUAL)
}
const bestLine = (points: readonly Point[]) => {
  let best: Point[] = []
  let fit: Fit | null = null
  for (let first = 0; first < points.length; first++) {
    for (let second = first + 1; second < points.length; second++) {
      const neighbors = lineThrough(points, points[first], points[second])
      if (neighbors.length < Math.max(2, best.length)) {
        continue
      }
      const candidate = refit(neighbors)
      if (neighbors.length > best.length || fit === null || candidate.residual < fit.residual) {
        best = neighbors
        fit = candidate
      }
    }
  }
  return { fit, points: best }
}
const lineVerdict = (fit: Fit, points: readonly Point[]): TrackShape => {
  const extremes = [Math.min(...points.map((point) => point.time)), Math.max(...points.map((point) => point.time))]
  if (extremes.every((time) => Math.abs(fit.offset + (fit.ratio - 1) * time) <= AGREE_TOLERANCE)) {
    return 'aligned'
  }
  return fit.ratio >= REPAIR_RATIO[0] && fit.ratio <= REPAIR_RATIO[1] && Math.abs(fit.offset) <= REPAIR_MAX_OFFSET ? 'linear' : 'uncorrectable'
}
const fittedAssessment = (points: readonly Point[], informative: number): Pick<TrackAssessment, 'shape' | 'fit'> => {
  const need = Math.max(INFORMATIVE_MIN, Math.ceil((2 * points.length) / 3))
  const constant = constantFit(points, need)
  if (constant !== null) {
    return Math.abs(constant.offset) <= AGREE_TOLERANCE ? { fit: null, shape: 'aligned' } : { fit: constant, shape: 'constant' }
  }
  const line = bestLine(points)
  if (line.fit !== null && line.points.length >= need) {
    const shape = lineVerdict(line.fit, line.points)
    return { fit: shape === 'linear' ? line.fit : null, shape }
  }
  return {
    fit: null,
    shape: points.filter((point) => Math.abs(point.offset) > AGREE_TOLERANCE).length >= informative / 2 ? 'uncorrectable' : 'inconclusive',
  }
}
export const assessTrack = (cues: readonly Cue[], windows: readonly SpeechWindow[]): TrackAssessment => {
  const assessments = windows.map((window) => correlateWindow(cues, window))
  const informative = assessments.filter((window) => window !== null).length
  const result = (shape: TrackShape): TrackAssessment => ({ fit: null, shape, windows: assessments })
  if (informative < INFORMATIVE_MIN) {
    return result('inconclusive')
  }
  const lastEnd = cues.reduce((last, cue) => Math.max(last, cue.end), 0)
  const uncovered = windows.filter((window, index) => assessments[index] !== null && window.start >= lastEnd).length
  if (uncovered >= UNCOVERED_MIN) {
    return result('truncated')
  }
  const points: Point[] = []
  for (const [index, assessment] of assessments.entries()) {
    if (assessment === null) {
      continue
    }
    const offset = pointOffset(assessment)
    if (offset !== null) {
      points.push({ offset, time: windows[index].start + windows[index].duration / 2 })
    }
  }
  if (points.filter((point) => point.offset === 0).length >= (2 * informative) / 3) {
    return result('aligned')
  }
  if (informative - points.length > informative / 3) {
    return result('inconclusive')
  }
  return { ...fittedAssessment(points, informative), windows: assessments }
}
