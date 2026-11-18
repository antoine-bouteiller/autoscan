import { describe, expect, test } from 'bun:test'

import { isForcedSubtitleContent } from '@/shared/utils/subtitle'

const cue = (start: string, end = '00:00:03,000') => `1\n${start} --> ${end}\nText`

describe('subtitle content helpers', () => {
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
})
