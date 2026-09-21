import { describe, expect, test } from 'bun:test'

import { DateTime } from 'effect'

import { areSubtitlesOutOfSync, isForcedSubtitleContent, parseStartTimestamps, parseTimestampMs } from '@/shared/utils/subtitle'

const cue = (start: string, end = '00:00:03,000') => `1\n${start} --> ${end}\nText`

describe('subtitle content helpers', () => {
  test('converts zero, milliseconds, and hour-long timestamps', () => {
    expect(parseTimestampMs('00:00:00,000')).toBe(0)
    expect(parseTimestampMs('00:00:01,500')).toBe(1500)
    expect(parseTimestampMs('01:02:03,004')).toBe(3_723_004)
  })

  test('keeps forced thresholds strict', () => {
    const threeCuesInOneMinute = [cue('00:00:00,000', '00:00:03,000'), cue('00:00:20,000', '00:00:23,000'), cue('00:00:40,000', '00:00:43,000')].join(
      '\n\n'
    )
    const exactlyFifteenPercent = cue('00:00:00,000', '00:00:09,000')

    expect(isForcedSubtitleContent(threeCuesInOneMinute, 60)).toBe(false)
    expect(isForcedSubtitleContent(threeCuesInOneMinute.replaceAll('\n', '\r\n'), 60)).toBe(false)
    expect(isForcedSubtitleContent(exactlyFifteenPercent, 60)).toBe(true)
    expect(isForcedSubtitleContent('', 0)).toBe(false)
  })

  test('parses starts and keeps timing and majority thresholds strict', () => {
    const aligned = `${cue('00:00:01,000')}\n\n${cue('00:00:04,000')}`
    const exactlyThreeHundredMs = `${cue('00:00:01,300')}\n\n${cue('00:00:04,300')}`
    const oneOfTwoOffset = `${cue('00:00:01,500')}\n\n${cue('00:00:04,000')}`

    expect(parseStartTimestamps(aligned)).toEqual([1000, 4000])
    expect(parseStartTimestamps(aligned.replaceAll('\n', '\r\n'))).toEqual([1000, 4000])
    expect(parseStartTimestamps('not a timestamp')).toEqual([])
    expect(areSubtitlesOutOfSync(aligned, aligned)).toBe(false)
    expect(areSubtitlesOutOfSync(aligned, exactlyThreeHundredMs)).toBe(false)
    expect(areSubtitlesOutOfSync(aligned, oneOfTwoOffset)).toBe(false)
    expect(areSubtitlesOutOfSync('', aligned)).toBe(false)
    expect(areSubtitlesOutOfSync(aligned, `${cue('00:00:01,500')}\n\n${cue('00:00:04,500')}\n\n${cue('00:00:08,000')}`)).toBe(true)
  })

  test('matches timestamps rather than cue numbers when translations split or omit cues', () => {
    const original = ['00:00:01,000', '00:00:04,000', '00:00:07,000', '00:00:10,000'].map((start) => cue(start)).join('\n\n')
    const split = ['00:00:01,000', '00:00:02,000', '00:00:04,000', '00:00:07,000', '00:00:10,000'].map((start) => cue(start)).join('\n\n')
    const omitted = ['00:00:04,000', '00:00:07,000', '00:00:10,000'].map((start) => cue(start)).join('\n\n')
    expect(areSubtitlesOutOfSync(original, split)).toBe(false)
    expect(areSubtitlesOutOfSync(split, original)).toBe(false)
    expect(areSubtitlesOutOfSync(original, omitted)).toBe(false)
    expect(areSubtitlesOutOfSync(omitted, original)).toBe(false)
    expect(areSubtitlesOutOfSync(original, original.split('\n\n').toReversed().join('\n\n'))).toBe(false)
  })

  test('does not reuse one timestamp to match multiple cues', () => {
    const repeated = [cue('00:00:01,000'), cue('00:00:01,100'), cue('00:00:01,200')].join('\n\n')
    const distinct = [cue('00:00:01,000'), cue('00:00:04,000'), cue('00:00:07,000')].join('\n\n')
    expect(areSubtitlesOutOfSync(repeated, distinct)).toBe(true)
    expect(areSubtitlesOutOfSync(distinct, repeated)).toBe(true)
  })

  test('accepts Anora opening dialogue despite different English and French segmentation', () => {
    // Start times only from the downloaded sidecars, before 00:03:00; no dialogue or media fixture needed.
    const english = [151_907, 153_450, 155_577, 159_039, 161_333, 164_094, 165_971, 167_807, 170_050, 172_036, 174_196, 177_841]
    const french = [
      151_682, 153_684, 155_561, 158_314, 159_523, 160_941, 164_194, 166_071, 167_781, 169_116, 170_200, 171_535, 172_828, 174_079, 175_372, 177_917,
    ]
    const content = (starts: number[], offset = 0) =>
      starts
        .map((start) =>
          cue(
            DateTime.formatIso(DateTime.makeUnsafe(start + offset))
              .slice(11, 23)
              .replace('.', ',')
          )
        )
        .join('\n\n')
    expect(areSubtitlesOutOfSync(content(english), content(french))).toBe(false)
    expect(areSubtitlesOutOfSync(content(french), content(english))).toBe(false)
    expect(areSubtitlesOutOfSync(content(english), content(english, 1000))).toBe(true)
  })
})
