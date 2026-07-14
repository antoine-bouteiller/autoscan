import { beforeEach, describe, expect, jest, spyOn, test } from 'bun:test'

import { container, TOKENS } from '@/core/container'
import { getTranscodingStatus, runTranscodeProcess } from '@/features/transcoding/jobs/transcode.job'

import '../../../utils.ts'

describe('transcode.job', () => {
  const plexClient = container.resolve(TOKENS.PLEX_CLIENT)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('runTranscodeProcess should resolve without throwing when no sections', async () => {
    spyOn(plexClient, 'getSections').mockResolvedValue([])
    expect(await runTranscodeProcess()).toBeUndefined()
  })

  test('runTranscodeProcess should skip media with invalid metadata', async () => {
    spyOn(plexClient, 'getSections').mockResolvedValue([{ key: 1, title: 'Movies', type: 'movie' as const }])
    spyOn(plexClient, 'getSectionMedia').mockResolvedValue([
      {
        Media: [],
        key: 'unknown-key',
        ratingKey: 'unknown',
        title: 'Unknown',
        type: 'movie',
        year: 2023,
      },
    ])

    expect(await runTranscodeProcess()).toBeUndefined()
  })

  test('getTranscodingStatus should return a boolean', () => {
    expect(typeof getTranscodingStatus()).toBe('boolean')
  })
})
