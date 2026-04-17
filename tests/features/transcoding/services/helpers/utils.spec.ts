import { describe, expect, test } from 'vite-plus/test'

import { isStreamWanted, type Criteria } from '#features/transcoding/services/helpers/utils'
import { type FFprobeStream } from '#integrations/ffmpeg/ffmpeg.validator'

const makeStream = (overrides: Partial<FFprobeStream> = {}): FFprobeStream => ({
  codec_name: 'aac',
  codec_type: 'audio',
  tags: { language: 'en' },
  ...overrides,
})

describe('isStreamWanted', () => {
  test('should match stream by language', () => {
    const criteria: Criteria = { language: 'en' }
    const stream = makeStream({ tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  test('should not match stream with different language', () => {
    const criteria: Criteria = { language: 'fr' }
    const stream = makeStream({ tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(false)
  })

  test('should match undefined language streams with "und" criteria', () => {
    const criteria: Criteria = { language: 'und' }
    const stream = makeStream({ tags: {} })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  test('should not match defined language streams with "und" criteria', () => {
    const criteria: Criteria = { language: 'und' }
    const stream = makeStream({ tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(false)
  })

  test('should exclude streams matching exclude terms in title', () => {
    const criteria: Criteria = { exclude: ['commentary'], language: 'en' }
    const stream = makeStream({ tags: { language: 'en', title: 'Director Commentary' } })

    expect(isStreamWanted(criteria)(stream)).toBe(false)
  })

  test('should not exclude streams without matching title', () => {
    const criteria: Criteria = { exclude: ['commentary'], language: 'en' }
    const stream = makeStream({ tags: { language: 'en', title: 'English Stereo' } })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  test('should filter by wanted encodings', () => {
    const criteria: Criteria = { language: 'en', wantedEncodings: ['aac', 'ac3'] }
    const aacStream = makeStream({ codec_name: 'aac', tags: { language: 'en' } })
    const flacStream = makeStream({ codec_name: 'flac', tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(aacStream)).toBe(true)
    expect(isStreamWanted(criteria)(flacStream)).toBe(false)
  })

  test('should match any encoding when wantedEncodings is empty', () => {
    const criteria: Criteria = { language: 'en', wantedEncodings: [] }
    const stream = makeStream({ codec_name: 'opus', tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  test('should handle streams without tags', () => {
    const criteria: Criteria = { language: 'und' }
    const stream: FFprobeStream = { codec_type: 'audio' }

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })
})
