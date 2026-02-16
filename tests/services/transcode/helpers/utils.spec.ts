import { describe, expect, it } from '@effect/vitest'

import type { FfprobeStream } from '@/schemas/ffmpeg'
import { type Criteria, isStreamWanted, simpleHash } from '@/services/transcode/helpers/utils'

const makeStream = (overrides: Partial<FfprobeStream> = {}): FfprobeStream => ({
  codec_type: 'audio',
  codec_name: 'aac',
  tags: { language: 'en' },
  ...overrides,
})

describe('isStreamWanted', () => {
  it('should match stream by language', () => {
    const criteria: Criteria = { language: 'en' }
    const stream = makeStream({ tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  it('should not match stream with different language', () => {
    const criteria: Criteria = { language: 'fr' }
    const stream = makeStream({ tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(false)
  })

  it('should match undefined language streams with "und" criteria', () => {
    const criteria: Criteria = { language: 'und' }
    const stream = makeStream({ tags: {} })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  it('should not match defined language streams with "und" criteria', () => {
    const criteria: Criteria = { language: 'und' }
    const stream = makeStream({ tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(false)
  })

  it('should exclude streams matching exclude terms in title', () => {
    const criteria: Criteria = { language: 'en', exclude: ['commentary'] }
    const stream = makeStream({ tags: { language: 'en', title: 'Director Commentary' } })

    expect(isStreamWanted(criteria)(stream)).toBe(false)
  })

  it('should not exclude streams without matching title', () => {
    const criteria: Criteria = { language: 'en', exclude: ['commentary'] }
    const stream = makeStream({ tags: { language: 'en', title: 'English Stereo' } })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  it('should filter by wanted encodings', () => {
    const criteria: Criteria = { language: 'en', wantedEncodings: ['aac', 'ac3'] }
    const aacStream = makeStream({ codec_name: 'aac', tags: { language: 'en' } })
    const flacStream = makeStream({ codec_name: 'flac', tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(aacStream)).toBe(true)
    expect(isStreamWanted(criteria)(flacStream)).toBe(false)
  })

  it('should match any encoding when wantedEncodings is empty', () => {
    const criteria: Criteria = { language: 'en', wantedEncodings: [] }
    const stream = makeStream({ codec_name: 'opus', tags: { language: 'en' } })

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })

  it('should handle streams without tags', () => {
    const criteria: Criteria = { language: 'und' }
    const stream: FfprobeStream = { codec_type: 'audio' }

    expect(isStreamWanted(criteria)(stream)).toBe(true)
  })
})

describe('simpleHash', () => {
  it('should return a number', () => {
    expect(typeof simpleHash('hello')).toBe('number')
  })

  it('should return the same hash for the same input', () => {
    expect(simpleHash('test')).toBe(simpleHash('test'))
  })

  it('should return different hashes for different inputs', () => {
    expect(simpleHash('hello')).not.toBe(simpleHash('world'))
  })

  it('should return 0 for an empty string', () => {
    expect(simpleHash('')).toBe(0)
  })
})
