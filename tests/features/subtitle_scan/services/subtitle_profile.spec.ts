import { describe, expect, test } from 'bun:test'

import {
  correct,
  cut,
  frenchControls,
  loadCorpus,
  loadInterstellar,
  quarters,
  shifts,
  trackOf,
  transform,
} from '@tests/fixtures/subtitle_scan/corpus'

import { assessTrack } from '@/features/subtitle_scan/services/subtitle_alignment'
import { type Cue, type PairShape, parseCues, passesCoverage, profilePair } from '@/features/subtitle_scan/services/subtitle_profile'

describe('parseCues', () => {
  test('parses and sorts LF/CRLF cues, discards non-positive intervals, and extracts sentence/dialogue anchors', () => {
    const content = `2\n00:00:03,200 --> 00:00:04,500\n<b>Alice</b> met Bob's 42 cats. Carol likes David.\n- Edward knows François’s 7 friends\nAnd Grace\n\n1\n00:00:01.000 --> 00:00:02.000\nI’m here with Henry\n\n3\n00:00:05,000 --> 00:00:05,000\nIgnored\n\n4\n00:00:07,000 --> 00:00:06,000\nIgnored`
    const expected = [
      { anchors: ['henry'], end: 2, start: 1 },
      { anchors: ['bob', '42', 'david', 'françois', '7', 'and', 'grace'], end: 4.5, start: 3.2 },
    ]
    expect(parseCues(content)).toEqual(expected)
    expect(parseCues(content.replaceAll('\n', '\r\n'))).toEqual(expected)
    expect(parseCues('not an SRT')).toEqual([])
  })
})

describe('profilePair', () => {
  const reference = Array.from({ length: 120 }, (_value, index) => ({ anchors: [`opaque-${index}`], end: index * 5 + 3, start: index * 5 + 1 }))
  test('finds agreement, signed constant shifts and common framerate drift', () => {
    expect(profilePair(reference, reference, 600).shape).toBe('agree')
    const shifted = profilePair(reference, transform(reference, 1, -5), 600)
    expect(shifted.shape).toBe('constant')
    expect(shifted.fit?.offset).toBeCloseTo(-5)
    const drifted = profilePair(reference, transform(reference, 25 / 23.976, 0), 600)
    expect(drifted.shape).toBe('linear')
    expect(drifted.fit?.ratio).toBeCloseTo(25 / 23.976, 4)
  })
  test('abstains with fewer than three determined segments or insufficient cues', () => {
    expect(profilePair(reference.slice(0, 40), reference.slice(0, 40), 600).shape).toBe('undetermined')
    expect(profilePair([], [], 600).shape).toBe('undetermined')
  })
  test('abstains rather than calling unrelated a pair whose shared timing has several equal offsets', () => {
    const periodic = reference.map((cue) => ({ ...cue, anchors: [] }))
    const result = profilePair(periodic, periodic, 600)
    expect(result.segments.every((segment) => segment.offset === null)).toBe(true)
    expect(result.shape).toBe('undetermined')
  })
})

const corpus = await loadCorpus()
describe('French corpus replay', () => {
  for (const media of corpus.filter((item) => frenchControls.includes(item.id))) {
    const reference = trackOf(media, 'en').cues
    const track = trackOf(media, 'fr').cues
    test(`${media.id}: real resegmented French agrees with English`, () => {
      const result = profilePair(reference, track, media.duration)
      expect(result.shape).toBe('agree')
      expect(result.fit).toBeNull()
    })
    for (const offset of shifts) {
      test(`${media.id}: French shifted ${offset}s profiles a constant within 0.5s`, () => {
        const result = profilePair(reference, transform(track, 1, offset), media.duration)
        expect(result.shape).toBe('constant')
        expect(result.fit).not.toBeNull()
        expect(Math.abs((result.fit?.offset ?? Number.POSITIVE_INFINITY) - offset)).toBeLessThanOrEqual(0.5 + 1e-9)
        expect(result.fit?.ratio).toBe(1)
      })
    }
    test(`${media.id}: French 25fps timing profiles linear within 0.002`, () => {
      const result = profilePair(reference, transform(track, 25 / 23.976, 0), media.duration)
      expect(result.shape).toBe('linear')
      expect(Math.abs((result.fit?.ratio ?? 0) - 25 / 23.976)).toBeLessThanOrEqual(0.002)
    })
    test(`${media.id}: quarter shifts are piecewise; a 46% cut agrees but fails coverage`, () => {
      expect(profilePair(reference, quarters(track, media.duration), media.duration).shape).toBe('piecewise')
      const truncated = cut(track, media.duration)
      expect(profilePair(reference, truncated, media.duration).shape).toBe('agree')
      expect(passesCoverage(reference, truncated, media.duration)).toBe(false)
    })
  }
  test('all 108 cross-episode Suits French profiles are unrelated or undetermined', () => {
    const suits = corpus.filter((media) => media.name.startsWith('Suits'))
    let pairs = 0
    for (const reference of suits) {
      for (const track of suits.filter((other) => other.id !== reference.id && other.tracks.has('fr'))) {
        const result = profilePair(trackOf(reference, 'en').cues, trackOf(track, 'fr').cues, reference.duration)
        expect(new Set<PairShape>(['unrelated', 'undetermined']).has(result.shape)).toBe(true)
        expect(result.fit).toBeNull()
        pairs++
      }
    }
    expect(pairs).toBe(108)
  })
  test('Interstellar interval-only translated track agrees', async () => {
    const media = await loadInterstellar()
    expect(profilePair(media.reference, media.track, media.duration).shape).toBe('agree')
  })
  test('House of the Dragon French retains the drift of the corrected English reference', () => {
    const media = corpus.find((item) => item.id === 'm23')
    if (media === undefined) {
      throw new Error('Missing m23')
    }
    const english = trackOf(media, 'en').cues
    const assessment = assessTrack(english, media.windows)
    if (assessment.fit === null) {
      throw new Error('Missing English drift fit')
    }
    const result = profilePair(correct(english, assessment.fit), trackOf(media, 'fr').cues, media.duration)
    expect(result.shape).toBe('linear')
    expect(Math.abs((result.fit?.ratio ?? 0) - assessment.fit.ratio)).toBeLessThanOrEqual(0.002)
  })
})

const endingAt = (end: number): Cue[] => [{ anchors: [], end, start: 0 }]
describe('passesCoverage', () => {
  test('coverage bounds are inclusive and a failing reference exempts the sibling', () => {
    for (const [duration, overrun] of [
      [1000, 60],
      [4000, 120],
    ]) {
      const reference = endingAt(duration)
      expect(passesCoverage(reference, endingAt(duration * 0.75), duration)).toBe(true)
      expect(passesCoverage(reference, endingAt(duration * 0.75 - 0.01), duration)).toBe(false)
      expect(passesCoverage(reference, endingAt(duration + overrun), duration)).toBe(true)
      expect(passesCoverage(reference, endingAt(duration + overrun + 0.01), duration)).toBe(false)
      expect(passesCoverage(endingAt(duration * 0.46), endingAt(duration * 0.46), duration)).toBe(true)
      expect(passesCoverage(endingAt(duration + overrun + 1), endingAt(duration * 0.46), duration)).toBe(true)
      expect(passesCoverage(reference, [], duration)).toBe(false)
      expect(passesCoverage([], [], duration)).toBe(true)
    }
  })
  test('a French track 100s late with a reference ending 20s before runtime passes after correction', () => {
    const reference = Array.from({ length: 114 }, (_value, index) => ({
      anchors: [`opaque-${index}`],
      end: index === 113 ? 580 : index * 5 + 3,
      start: index * 5 + 1,
    }))
    const track = transform(reference, 1, 100)
    expect(passesCoverage(reference, track, 600)).toBe(false)
    const result = profilePair(reference, track, 600)
    expect(result.shape).toBe('constant')
    if (result.fit === null) {
      throw new Error('Missing constant fit')
    }
    expect(result.fit.offset).toBeCloseTo(100)
    const repaired = correct(track, result.fit)
    expect(profilePair(reference, repaired, 600).shape).toBe('agree')
    expect(passesCoverage(reference, repaired, 600)).toBe(true)
  })
})

const grid = (step: number, tag: string) =>
  Array.from({ length: 120 }, (_value, index) => ({ anchors: [`${tag}-${index}`], end: index * step + 1, start: index * step }))

describe('profilePair boundaries', () => {
  test('segments require at least ten reference cue starts; three determined segments suffice', () => {
    const cues = Array.from({ length: 30 }, (_value, index) => ({
      anchors: [`opaque-${index}`],
      end: Math.floor(index / 10) * 400 + (index % 10) * 3 + 1,
      start: Math.floor(index / 10) * 400 + (index % 10) * 3,
    }))
    const result = profilePair(cues, cues, 2400)
    expect(result.shape).toBe('agree')
    expect(result.segments.filter((segment) => segment.offset !== null)).toHaveLength(3)
    const sparse = cues.filter((_cue, index) => index % 10 !== 0)
    expect(profilePair(sparse, sparse, 2400).shape).toBe('undetermined')
  })
  describe('a jump halfway through the track', () => {
    const reference = Array.from({ length: 300 }, (_value, index) => ({
      anchors: [`opaque-${index}`],
      end: index * 2 + 2,
      start: index * 2 + 1 + (index % 7) * 0.13,
    }))
    const jumped = (jump: number) => reference.map((cue) => (cue.start >= 300 ? { ...cue, end: cue.end + jump, start: cue.start + jump } : cue))
    test('beyond twice the agreement tolerance is piecewise, neither agreed nor fitted', () => {
      for (const jump of [3, 3.2, 5]) {
        const result = profilePair(reference, jumped(jump), 600)
        expect({ jump, shape: result.shape }).toEqual({ jump, shape: 'piecewise' })
        expect(result.fit).toBeNull()
      }
    })
    test('past the agreement tolerance is not agreed, and its repair brings both halves within it', () => {
      for (const jump of [1.6, 2, 2.6]) {
        const result = profilePair(reference, jumped(jump), 600)
        expect({ jump, shape: result.shape }).not.toEqual({ jump, shape: 'agree' })
        if (result.fit === null) {
          throw new Error(`Missing fit for a ${jump}s jump`)
        }
        expect({ jump, shape: profilePair(reference, correct(jumped(jump), result.fit), 600).shape }).toEqual({ jump, shape: 'agree' })
      }
    })
  })
  test('an other-episode pair with enough cues in every segment is unrelated', () => {
    expect(profilePair(grid(5, 'a'), grid(5.37, 'b'), 600).shape).toBe('unrelated')
  })
  test('least-squares fallback finds non-framerate linear timing and rejects excessive slope', () => {
    const reference = Array.from({ length: 120 }, (_value, index) => ({ anchors: [`opaque-${index}`], end: index * 5 + 3, start: index * 5 + 1 }))
    const result = profilePair(reference, transform(reference, 1.02, 12), 600)
    expect(result.shape).toBe('linear')
    expect(Math.abs((result.fit?.ratio ?? 0) - 1.02)).toBeLessThanOrEqual(0.002)
    expect(Math.abs((result.fit?.offset ?? 0) - 12)).toBeLessThanOrEqual(1)
    const excessive = reference.map((cue) => {
      const offset = (Math.floor(cue.start / 100) * 100 + 50) * 0.2
      return { ...cue, end: cue.end + offset, start: cue.start + offset }
    })
    const rejected = profilePair(reference, excessive, 600)
    expect(rejected.segments.filter((segment) => segment.offset !== null).length).toBeGreaterThanOrEqual(3)
    expect(rejected.shape).toBe('piecewise')
    expect(rejected.fit).toBeNull()
  })
})
