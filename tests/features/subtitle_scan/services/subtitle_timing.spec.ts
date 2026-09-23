import { describe, expect, test } from 'bun:test'

import { DateTime } from 'effect'

import { assessSubtitleTiming } from '@/features/subtitle_scan/services/subtitle_timing'
import { type SpeechActivity } from '@/integrations/ffmpeg/ffmpeg.service'

const timestamp = (seconds: number) =>
  DateTime.formatIso(DateTime.makeUnsafe(seconds * 1000))
    .slice(11, 23)
    .replace('.', ',')
const content = (intervals: readonly (readonly [number, number])[]) =>
  intervals.map(([start, end], index) => `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\ntext`).join('\n\n')
const intervals: [number, number][] = [
  [2, 4],
  [9, 13],
  [21, 24],
  [31, 33],
  [42, 47],
  [55, 59],
  [68, 71],
  [82, 84],
  [93, 97],
]
const activity: SpeechActivity = { duration: 100, intervals }
const cues = (window: number) =>
  Array.from({ length: 40 }, (_entry, index): [number, number] => [window * 300 + 2 + index * 7, window * 300 + 5 + index * 7])
const noise = (window: number) =>
  Array.from({ length: 120 }, (_entry, index): [number, number] => [window * 300 + index * 2.5, window * 300 + index * 2.5 + 1.2])

describe('assessSubtitleTiming', () => {
  test('accepts a subtitle independently against speech, including CRLF and a 500 ms timing tolerance', () => {
    expect(assessSubtitleTiming(content(intervals), activity).verdict).toBe('aligned')
    const translated = intervals.map(([start, end]): [number, number] => [start + 0.5, end + 0.5])
    expect(assessSubtitleTiming(content(translated).replaceAll('\n', '\r\n'), activity).verdict).toBe('aligned')
  })

  test('rejects large offsets even when broad subtitle intervals still overlap speech', () => {
    for (const offset of [-2, 2, 8]) {
      const shifted = intervals.map(([start, end]): [number, number] => [start + offset, end + offset])
      expect(assessSubtitleTiming(content(shifted), activity).verdict).toBe('misaligned')
    }
  })

  test('rejects unrelated timing without relying on sibling agreement', () => {
    const wrong = content([
      [5, 8],
      [15, 19],
      [26, 29],
      [35, 39],
      [49, 52],
      [61, 65],
      [74, 78],
      [87, 90],
    ])
    expect(assessSubtitleTiming(wrong, activity).verdict).toBe('misaligned')
  })

  test('checks each populated window rather than hiding a changed scene in a whole-movie average', () => {
    const full = Array.from({ length: 4 }, (_entry, window) =>
      intervals.map(([start, end]): [number, number] => [start + window * 300, end + window * 300])
    ).flat()
    const partial = full.map(([start, end]): [number, number] => (start >= 900 ? [start + 3, end + 3] : [start, end]))
    const result = assessSubtitleTiming(content(partial), { duration: 1200, intervals: full })
    expect(result.verdict).toBe('misaligned')
    expect(result.windows.map((window) => window.verdict)).toEqual(['aligned', 'aligned', 'aligned', 'misaligned'])
  })

  test('leaves silence, continuous speech, sparse cues, and malformed files inconclusive', () => {
    expect(assessSubtitleTiming(content(intervals), { duration: 100, intervals: [] }).verdict).toBe('inconclusive')
    expect(assessSubtitleTiming(content(intervals), { duration: 100, intervals: [[0, 100]] }).verdict).toBe('inconclusive')
    expect(assessSubtitleTiming(content(intervals.slice(0, 2)), activity).verdict).toBe('inconclusive')
    for (const malformed of ['', 'not an SRT', content([[5, 4]]), `${content(intervals)}\n\nbroken cue`, '1\n00:99:00,000 --> 00:99:01,000\ntext']) {
      expect(assessSubtitleTiming(malformed, activity).verdict).toBe('inconclusive')
    }
  })

  test('does not pass a subtitle when one populated window has no usable speech evidence', () => {
    const second = intervals.map(([start, end]): [number, number] => [start + 300, end + 300])
    const result = assessSubtitleTiming(content([...intervals, ...second]), { duration: 600, intervals })
    expect(result.verdict).toBe('inconclusive')
    expect(result.windows.map((window) => window.verdict)).toEqual(['aligned', 'inconclusive'])
  })

  test('does not silently pass sparse mismatched windows after an aligned section', () => {
    const opening = Array.from({ length: 40 }, (_entry, index): [number, number] => [2 + index * 7, 5 + index * 7])
    const sparse: [number, number][] = [
      [302, 304],
      [321, 324],
      [342, 347],
      [368, 371],
    ]
    const wrong = sparse.map(([start, end]): [number, number] => [start + 30, end + 30])
    const result = assessSubtitleTiming(content([...opening, ...wrong]), { duration: 600, intervals: [...opening, ...sparse] })
    expect(result.verdict).toBe('inconclusive')
    expect(result.windows.map((window) => window.verdict)).toEqual(['aligned', 'inconclusive'])
    const crossing: [number, number][] = [...opening, [295, 310]]
    const overlapped = assessSubtitleTiming(content(crossing), { duration: 600, intervals: crossing })
    expect(overlapped.verdict).toBe('inconclusive')
    expect(overlapped.windows).toHaveLength(2)
  })

  test('treats uncorrelated windows as detector noise unless they outnumber aligned windows', () => {
    const subtitle = content([0, 1, 2].flatMap(cues))
    const oneNoisy = assessSubtitleTiming(subtitle, { duration: 900, intervals: [...cues(0), ...cues(1), ...noise(2)] })
    expect(oneNoisy.windows.map((window) => window.verdict)).toEqual(['aligned', 'aligned', 'uncorrelated'])
    expect(oneNoisy.verdict).toBe('inconclusive')
    const mostlyNoisy = assessSubtitleTiming(subtitle, { duration: 900, intervals: [...cues(0), ...noise(1), ...noise(2)] })
    expect(mostlyNoisy.windows.map((window) => window.verdict)).toEqual(['aligned', 'uncorrelated', 'uncorrelated'])
    expect(mostlyNoisy.verdict).toBe('misaligned')
  })

  test('does not ignore substantial subtitle content beyond the audio runtime', () => {
    expect(assessSubtitleTiming(content([...intervals, [110, 130]]), activity).verdict).toBe('misaligned')
    expect(assessSubtitleTiming(content([...intervals, [110, 130]]), { duration: 100, intervals: [] }).verdict).toBe('inconclusive')
  })
})
