import { describe, expect, test } from 'bun:test'

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
    expect(isForcedSubtitleContent(exactlyFifteenPercent, 60)).toBe(true)
    expect(isForcedSubtitleContent('', 0)).toBe(false)
  })

  test('parses starts and compares only aligned positional cues', () => {
    const aligned = `${cue('00:00:01,000')}\n\n${cue('00:00:04,000')}`
    const exactlyThreeHundredMs = `${cue('00:00:01,300')}\n\n${cue('00:00:04,300')}`
    const oneOfTwoOffset = `${cue('00:00:01,500')}\n\n${cue('00:00:04,000')}`

    expect(parseStartTimestamps(aligned)).toEqual([1000, 4000])
    expect(parseStartTimestamps('not a timestamp')).toEqual([])
    expect(areSubtitlesOutOfSync(aligned, aligned)).toBe(false)
    expect(areSubtitlesOutOfSync(aligned, exactlyThreeHundredMs)).toBe(false)
    expect(areSubtitlesOutOfSync(aligned, oneOfTwoOffset)).toBe(false)
    expect(areSubtitlesOutOfSync('', aligned)).toBe(false)
    expect(areSubtitlesOutOfSync(aligned, `${cue('00:00:01,500')}\n\n${cue('00:00:04,500')}\n\n${cue('00:00:08,000')}`)).toBe(true)
  })
})
