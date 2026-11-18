/* oxlint-disable autoscan/no-shape-in-symbol-names, unicorn/no-null */
import { describe, expect, test } from 'bun:test'

import { correct, loadCorpus, shifts, trackOf, transform } from '@tests/fixtures/subtitle_scan/corpus'
import { replay } from '@tests/fixtures/subtitle_scan/replay'
import { speechFixture } from '@tests/fixtures/subtitle_scan/synthetic'
import { syntheticReplay } from '@tests/fixtures/subtitle_scan/synthetic_replay'

import { assessTrack } from '@/features/subtitle_scan/services/subtitle_alignment'
import { type Cue } from '@/features/subtitle_scan/services/subtitle_profile'

describe('assessTrack', () => {
  test('classifies aligned speech and signed constant offsets with diagnostic correlations', () => {
    const { cues, windows } = speechFixture()
    const aligned = assessTrack(cues, windows)
    expect(aligned.shape).toBe('aligned')
    expect(aligned.fit).toBeNull()
    expect(aligned.windows.every((window) => window?.atZero === 1)).toBe(true)
    for (const offset of [-5, 5]) {
      const shifted = assessTrack(transform(cues, 1, offset), windows)
      expect(shifted.shape).toBe('constant')
      expect(shifted.fit?.offset).toBeCloseTo(offset, 4)
      expect(shifted.fit?.ratio).toBe(1)
    }
  })
})

const corpus = await loadCorpus()
const real = await replay()
const synthetic = await syntheticReplay()
describe('[VC-9.1] English corpus replay', () => {
  test('[VC-9.1] none of the 22 audited in-sync English tracks is invalid or repairable; at least 18 align', () => {
    expect(real.realEnglish).toHaveLength(22)
    let aligned = 0
    for (const result of real.realEnglish) {
      expect(['aligned', 'inconclusive']).toContain(result.shape)
      expect(result.fit).toBeNull()
      if (result.shape === 'aligned') {
        aligned++
      }
    }
    expect(aligned).toBeGreaterThanOrEqual(18)
  })
  test('[VC-9.1] House of the Dragon English has ratio 1.0426 ± 0.002 and offset -52.2 ± 1s', () => {
    const media = corpus.find((item) => item.id === 'm23')
    if (media === undefined) {
      throw new Error('Missing m23')
    }
    const result = assessTrack(trackOf(media, 'en').cues, media.windows)
    expect(result.shape).toBe('linear')
    expect(Math.abs((result.fit?.ratio ?? 0) - 1.0426)).toBeLessThanOrEqual(0.002)
    expect(Math.abs((result.fit?.offset ?? 0) + 52.2)).toBeLessThanOrEqual(1)
  })
  test('[VC-9.1] Fleabag English has a constant +87.8 ± 0.5s offset', () => {
    const media = corpus.find((item) => item.id === 'm22')
    if (media === undefined) {
      throw new Error('Missing m22')
    }
    const result = assessTrack(trackOf(media, 'en').cues, media.windows)
    expect(result.shape).toBe('constant')
    expect(Math.abs((result.fit?.offset ?? 0) - 87.8)).toBeLessThanOrEqual(0.5)
  })
  test('[VC-9.1][VC-8.1] Hateful Eight is truncated and Desperate Housewives S01E04 is not aligned', () => {
    for (const [id, expected] of [
      ['m11', 'truncated'],
      ['m16', 'inconclusive'],
    ] as const) {
      const media = corpus.find((item) => item.id === id)
      if (media === undefined) {
        throw new Error(`Missing ${id}`)
      }
      const result = assessTrack(trackOf(media, 'en').cues, media.windows)
      expect(result.shape).toBe(expected)
      expect(result.fit).toBeNull()
    }
  })
  for (const offset of shifts) {
    test(`[VC-9.1] English shifted ${offset}s never aligns and at least half have accurate constant fits`, () => {
      const tracks = synthetic.shifted.filter((item) => item.applied === offset)
      expect(tracks).toHaveLength(22)
      let accurate = 0
      for (const { result } of tracks) {
        expect(result.shape).not.toBe('aligned')
        if (result.shape === 'constant' && result.fit !== null && Math.abs(result.fit.offset - offset) <= 0.5 + 1e-9) {
          accurate++
        }
      }
      expect(accurate).toBeGreaterThanOrEqual(11)
    })
  }
  test('[VC-9.1] short-media English drift is neither aligned nor constant', () => {
    expect(synthetic.drifted.length).toBeGreaterThan(0)
    for (const { result } of synthetic.drifted) {
      expect(['aligned', 'constant']).not.toContain(result.shape)
    }
  })
  test('[VC-9.1] English quarter shifts, 46% cuts and every other Suits episode never align', () => {
    expect(synthetic.quarters).toHaveLength(22)
    expect(synthetic.cut).toHaveLength(22)
    expect(synthetic.cross).toHaveLength(216)
    for (const { result } of [...synthetic.quarters, ...synthetic.cut, ...synthetic.cross]) {
      expect(result.shape).not.toBe('aligned')
      expect(result.fit).toBeNull()
    }
  })
  test('[VC-9.1] no synthetic fit is more than 1s from its applied shape throughout any sampled window', () => {
    expect(synthetic.fitted.length).toBeGreaterThanOrEqual(44)
    for (const item of synthetic.fitted) {
      const media = corpus.find((candidate) => candidate.id === item.id)
      if (media === undefined) {
        throw new Error(`Missing ${item.id}`)
      }
      for (const window of media.windows) {
        for (const time of [window.start, window.start + window.duration]) {
          const error = Math.abs((item.fit.ratio - item.ratio) * time + item.fit.offset - item.offset)
          expect(error).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('assessTrack boundaries', () => {
  test('[VC-12.1] fewer than four informative windows abstain, including silence', () => {
    const { cues, windows } = speechFixture()
    expect(assessTrack(cues, []).shape).toBe('inconclusive')
    expect(assessTrack(cues, windows.slice(0, 3)).shape).toBe('inconclusive')
    expect(assessTrack(cues, windows.slice(0, 4)).shape).toBe('aligned')
    const silent = assessTrack(
      cues,
      windows.map((window) => ({ ...window, speech: [] }))
    )
    expect(silent.shape).toBe('inconclusive')
    expect(silent.windows).toEqual(Array.from({ length: 8 }, () => null))
  })
  test('the 8% informative threshold is inclusive; a track covering whole windows with one cue abstains', () => {
    const windows = Array.from({ length: 4 }, (_value, index) => {
      const start = 200 + index * 400
      return { duration: 40, speech: [[start, start + 3.2] as const], start }
    })
    const cues: Cue[] = windows.map((window) => ({ anchors: [], end: window.start + 3.2, start: window.start }))
    expect(assessTrack(cues, windows).shape).toBe('aligned')
    const weak = windows.map((window) => ({ ...window, speech: [[window.start, window.start + 3.1] as const] }))
    expect(assessTrack(cues, weak).windows.every((window) => window === null)).toBe(true)
    for (const track of [[{ anchors: [], end: 10_000, start: 0 }], [{ anchors: [], end: 10_000, start: 9999 }]]) {
      const result = assessTrack(track, windows)
      expect(result.shape).toBe('inconclusive')
      expect(result.fit).toBeNull()
    }
  })
  test('[VC-8.1] exactly two speech windows at or after the last cue end take precedence over alignment', () => {
    const { cues, windows } = speechFixture()
    const lastEnd = windows[6].start
    const truncated = [...cues.slice(0, 48), { anchors: [], end: lastEnd, start: lastEnd - 1 }]
    const result = assessTrack(truncated, windows)
    expect(result.shape).toBe('truncated')
    expect(result.fit).toBeNull()
    expect(assessTrack([...truncated, { anchors: [], end: lastEnd + 0.1, start: lastEnd }], windows).shape).not.toBe('truncated')
  })
  test('a repairable linear fit uses track-against-speech sign and its inverse restores alignment', () => {
    const { cues, windows } = speechFixture()
    const shifted = transform(cues, 1.0425, -52)
    const result = assessTrack(shifted, windows)
    expect(result.shape).toBe('linear')
    expect(Math.abs((result.fit?.ratio ?? 0) - 1.0425)).toBeLessThanOrEqual(0.002)
    expect(Math.abs((result.fit?.offset ?? 0) + 52)).toBeLessThanOrEqual(1)
    if (result.fit === null) {
      throw new Error('Missing linear fit')
    }
    expect(assessTrack(correct(shifted, result.fit), windows).shape).toBe('aligned')
  })
  test('strong linear evidence outside the repair ratio is uncorrectable without a fit', () => {
    const { cues, windows } = speechFixture()
    const shifted = cues.map((cue, index) => {
      const centre = windows[Math.floor(index / 8)].start + 20
      const offset = (centre - 1620) * 0.08
      return { ...cue, end: cue.end + offset, start: cue.start + offset }
    })
    const result = assessTrack(shifted, windows)
    expect(result.shape).toBe('uncorrectable')
    expect(result.fit).toBeNull()
  })
})
