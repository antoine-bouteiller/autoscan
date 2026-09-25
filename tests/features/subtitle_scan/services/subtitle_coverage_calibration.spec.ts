/** Offline timing-only policy experiment, NOT the production coverage classifier. */
/* eslint-disable id-length, complexity, max-params, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-type-assertion, unicorn/prefer-array-find, unicorn/prefer-spread */
import { describe, expect, test } from 'bun:test'

type Interval = [number, number]
interface Case {
  durationMs: number
  tracks: { en: Interval[]; fr: Interval[] }
}
const timingFixtureText = await Bun.file(new URL('../../../fixtures/subtitle_scan/real_intervals.txt', import.meta.url)).text()
const timingFixtureLines = timingFixtureText.trim().split('\n')
const intervals = (line: string, language: 'en' | 'fr'): Interval[] => {
  if (!line.startsWith(`${language} `)) {
    throw new Error(`Expected ${language} timing fixture`)
  }
  return line
    .slice(3)
    .split(',')
    .map((pair) => {
      const [start, end] = pair.split('-')
      return [Number(start), Number(end)]
    })
}
const data: Record<string, Case> = {}
for (let index = 0; index < timingFixtureLines.length; index += 3) {
  const [name, duration] = timingFixtureLines[index].split(' ')
  data[name] = {
    durationMs: Number(duration),
    tracks: { en: intervals(timingFixtureLines[index + 1], 'en'), fr: intervals(timingFixtureLines[index + 2], 'fr') },
  }
}
const minute = 60_000
const bin = 5 * minute
const valid = (xs: Interval[], duration: number) =>
  xs.length > 0 && xs.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a >= 0 && a < b && b <= duration)
const count = (xs: Interval[], lo: number, hi: number) => xs.filter(([a]) => a >= lo && a < hi).length
const forced = (xs: Interval[], duration: number) =>
  xs.length / (duration / minute) < 3 || xs.reduce((sum, [a, b]) => sum + b - a, 0) / duration < 0.15
const runs = (xs: Interval[], duration: number) => {
  const result: Interval[] = []
  let start = -1
  for (let t = 0; t < duration; t += bin) {
    if (count(xs, t, t + bin) <= 1 && start < 0) {
      start = t
    }
    if (count(xs, t, t + bin) > 1 && start >= 0) {
      result.push([start, t])
      start = -1
    }
  }
  if (start >= 0) {
    result.push([start, duration])
  }
  return result
}
// One-to-one starts: a perfect periodic zero-lag alias must not make a shifted copy invalid.
const matches = (candidate: Interval[], reference: Interval[], shift: number) => {
  let i = 0
  let j = 0
  let matched = 0
  while (i < candidate.length && j < reference.length) {
    const delta = candidate[i][0] + shift - reference[j][0]
    if (Math.abs(delta) <= 500) {
      matched++
      i++
      j++
    } else if (delta < 0) {
      i++
    } else {
      j++
    }
  }
  return matched
}
const classify = (candidate: Interval[], reference: Interval[], duration: number) => {
  const metrics = { activeBins: '0/0', gapMin: 0, reason: 'none', shiftedMatch: 0 }
  const abstain = (reason: string) => ({ metrics: { ...metrics, reason }, verdict: 'abstain' })
  if (!valid(candidate, duration) || !valid(reference, duration)) {
    return abstain('invalid intervals')
  }
  const c = candidate.toSorted((a, b) => a[0] - b[0])
  const r = reference.toSorted((a, b) => a[0] - b[0])
  if (forced(c, duration) || forced(r, duration)) {
    return abstain('forced-looking')
  }
  const minimum = Math.max(20 * minute, 0.2 * duration)
  if (r[0][0] > Math.max(15 * minute, 0.15 * duration) || r.at(-1)![1] < duration - Math.max(10 * minute, 0.1 * duration)) {
    return abstain('reference span')
  }
  if (runs(r, duration).some(([a, b]) => b - a >= minimum)) {
    return abstain('reference gap')
  }
  const gaps = runs(c, duration).filter(([a, b]) => b - a >= minimum)
  if (gaps.length === 0) {
    return abstain('no extreme gap')
  }
  const [a, b] = gaps.reduce((longest, gap) => (gap[1] - gap[0] > longest[1] - longest[0] ? gap : longest))
  metrics.gapMin = Math.round((b - a) / minute)
  const bins = Array.from({ length: Math.floor((b - a) / bin) }, (_, i) => count(r, a + i * bin, a + (i + 1) * bin))
  metrics.activeBins = `${bins.filter((n) => n >= 3).length}/${bins.length}`
  if (bins.length === 0 || bins.filter((n) => n >= 3).length / bins.length < 0.8) {
    return abstain('reference not sustained')
  }
  const lateIsolated = c.filter(([start]) => start >= a)
  if (lateIsolated.length > 0 && lateIsolated.length <= 3 && lateIsolated.every(([start]) => start >= duration - bin)) {
    return abstain('isolated late credit/watermark')
  }
  const outside = c.filter(([start]) => start < a || start >= b)
  const comparable = r.filter(([start]) => start >= c[0][0] && start <= c.at(-1)![1] && (start < a || start >= b))
  if (outside.length < 100 || comparable.length === 0 || outside.length < 0.5 * comparable.length) {
    return abstain('candidate outside gap too sparse')
  }
  // Exact-ish cue-pattern identity at any large lag is strong evidence of a shifted copy;
  // Weak identity is not evidence that the longer sibling is correct.
  const offsets = [-10 * minute, 10 * minute, r[0][0] - c[0][0], r.at(-1)![0] - c.at(-1)![0]].filter((offset) => Math.abs(offset) >= 5 * minute)
  metrics.shiftedMatch = Math.max(...offsets.map((offset) => matches(c, r, offset))) / c.length
  if (metrics.shiftedMatch >= 0.8) {
    return abstain('shift/copy alias')
  }
  if (a === 0 || c[0][0] > 10 * minute) {
    return abstain('leading shift')
  }
  if (b >= duration - bin) {
    const span = c.filter(([start]) => start < a).at(-1)![1] - c[0][0]
    if (span * 1.05 + minimum > duration || span > 0.4 * duration) {
      return abstain('tail could be shifted/cut')
    }
  } else if (Math.abs(c.at(-1)![1] - r.at(-1)![1]) > bin || Math.abs(c[0][0] - r[0][0]) > bin || count(c, b, duration) < 100) {
    return abstain('cut endpoints/weak following coverage')
  }
  return { metrics: { ...metrics, reason: b >= duration - bin ? 'tail' : 'interior' }, verdict: 'invalid' }
}
const shifted = (xs: Interval[], by: number, duration: number): Interval[] =>
  xs.map(([a, b]) => [a + by, b + by] as Interval).filter(([a, b]) => a >= 0 && b <= duration)
const omitted = (xs: Interval[], a: number, b: number) => xs.filter(([start]) => start < a || start >= b)
const cases: [string, Interval[], Interval[], number, string][] = []
for (const [name, item] of Object.entries(data)) {
  cases.push([`${name}: English`, item.tracks.en, item.tracks.fr, item.durationMs, name === 'hateful_eight' ? 'invalid' : 'abstain'])
  cases.push([`${name}: French`, item.tracks.fr, item.tracks.en, item.durationMs, 'abstain'])
}
const D = 140 * minute
const periodic: Interval[] = Array.from({ length: 1620 }, (_, i) => [minute + i * 5000, minute + i * 5000 + 20_000])
let seed = 44_009
let t = minute
const irregular: Interval[] = []
while (t < D - 3 * minute) {
  irregular.push([t, t + 20_000])
  seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
  t += (2 + (seed % 6)) * 1000
}
for (const [label, base] of [
  ['periodic', periodic],
  ['irregular', irregular],
] as const) {
  cases.push([`${label} tail`, base.filter(([a]) => a < 45 * minute), base, D, label === 'periodic' ? 'abstain' : 'invalid'])
  cases.push([`${label} interior`, omitted(base, 40 * minute, 85 * minute), base, D, label === 'periodic' ? 'abstain' : 'invalid'])
  cases.push([`${label} shared gap`, omitted(base, 40 * minute, 85 * minute), omitted(base, 40 * minute, 85 * minute), D, 'abstain'])
  cases.push([`${label} reciprocal`, omitted(base, 40 * minute, 85 * minute), omitted(base, 85 * minute, 125 * minute), D, 'abstain'])
  cases.push([
    `${label} wrong cut`,
    base
      .filter(([a]) => a < 45 * minute)
      .concat(
        shifted(
          base.filter(([a]) => a >= 85 * minute),
          -40 * minute,
          D
        )
      ),
    base,
    D,
    'abstain',
  ])
  cases.push([
    `${label} wrong cut with matching endpoints`,
    [
      ...base.filter(([start]) => start < 45 * minute),
      ...shifted(
        base.filter(([start]) => start >= 85 * minute && start < 110 * minute),
        -40 * minute,
        D
      ),
      ...base.filter(([start]) => start >= 110 * minute),
    ],
    base,
    D,
    label === 'periodic' ? 'abstain' : 'invalid',
  ])
  cases.push([
    `${label} late credit`,
    base.filter(([a]) => a < 90 * minute),
    base.filter(([a]) => a < 90 * minute).concat([[D - minute, D - minute + 2000]]),
    D,
    'abstain',
  ])
  cases.push([`${label} sparse candidate`, base.filter((_, i) => i % 40 === 0), base, D, 'abstain'])
  cases.push([`${label} sparse reference`, base, base.filter((_, i) => i % 40 === 0), D, 'abstain'])
  for (const sign of [-1, 1]) {
    for (const distance of [25, 40]) {
      cases.push([`${label} shift ${sign * distance}m`, shifted(base, sign * distance * minute, D), base, D, 'abstain'])
      cases.push([`${label} shift ${sign * distance}m+31s`, shifted(base, sign * distance * minute + 31_000, D), base, D, 'abstain'])
    }
  }
}
const { interstellar } = data
cases.push([
  'interstellar split/merged translation',
  interstellar.tracks.en
    .filter((_, index) => index % 5 !== 0)
    .flatMap(([start, end], index) =>
      index % 4 === 0 && end - start > 1200
        ? ([
            [start, start + 500],
            [start + 600, end],
          ] as Interval[])
        : ([[start, end]] as Interval[])
    ),
  interstellar.tracks.fr,
  interstellar.durationMs,
  'abstain',
])
for (const jitter of [0, 600, 31_000]) {
  cases.push([
    `interstellar extreme interior wrong cut +${jitter}ms`,
    [
      ...interstellar.tracks.en.filter(([start]) => start < 45 * minute),
      ...shifted(
        interstellar.tracks.en.filter(([start]) => start >= 85 * minute && start < 110 * minute),
        -40 * minute + jitter,
        interstellar.durationMs
      ),
      ...interstellar.tracks.en.filter(([start]) => start >= 110 * minute),
    ],
    interstellar.tracks.fr,
    interstellar.durationMs,
    'invalid',
  ])
}
cases.push([
  'interstellar interior omission',
  omitted(interstellar.tracks.en, 60 * minute, 95 * minute),
  interstellar.tracks.fr,
  interstellar.durationMs,
  'invalid',
])
cases.push([
  'interstellar forced-like reference',
  interstellar.tracks.en,
  interstellar.tracks.fr.filter((_, i) => i % 40 === 0),
  interstellar.durationMs,
  'abstain',
])
cases.push([
  'dense tail with one late credit',
  irregular.filter(([a]) => a < 45 * minute).concat([[D - minute, D - minute + 2000]]),
  irregular,
  D,
  'abstain',
])
cases.push(['malformed', [[-1, 5000]], interstellar.tracks.fr, interstellar.durationMs, 'abstain'])
// Expected-invalid accepted risk, NOT a must-abstain control: identical intervals cannot prove dialogue.
cases.push(['plausible wrong dense reference (accepted risk)', irregular.filter(([a]) => a < 45 * minute), irregular, D, 'invalid'])

test('a globally shifted -84m same-track copy abstains', () => {
  expect(classify(shifted(irregular, -84 * minute + 31_000, D), irregular, D).verdict).toBe('abstain')
})

test.todo('a globally shifted translated track must abstain from metadata invalidation before audio', () => {
  expect(
    classify(shifted(interstellar.tracks.en, -100 * minute, interstellar.durationMs), interstellar.tracks.fr, interstellar.durationMs).verdict
  ).toBe('abstain')
})

describe('offline timing-only coverage calibration; not a production classifier', () => {
  test.each(cases)('%s', (name, candidate, reference, duration, expected) => {
    const result = classify(candidate, reference, duration)
    process.stdout.write(`${JSON.stringify({ name, ...result })}\n`)
    expect(result.verdict).toBe(expected)
    if (name !== 'malformed') {
      expect(result.metrics.reason).not.toBe('invalid intervals')
    }
  })
})
