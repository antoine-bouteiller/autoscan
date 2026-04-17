import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { container, TOKENS } from '#core/container'
import { getTranscodingStatus, runTranscodeProcess } from '#features/transcoding/jobs/transcode.job'

import '../../../utils.ts'

describe('transcode.job', () => {
  const plexClient = container.resolve(TOKENS.PLEX_CLIENT)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('runTranscodeProcess should resolve without throwing when no sections', async () => {
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([])
    await expect(runTranscodeProcess()).resolves.toBeUndefined()
  })

  test('runTranscodeProcess should skip media with invalid metadata', async () => {
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([{ key: 1, title: 'Movies', type: 'movie' as const }])
    vi.spyOn(plexClient, 'getSectionMedia').mockResolvedValue([
      {
        Media: [],
        key: 'unknown-key',
        ratingKey: 'unknown',
        title: 'Unknown',
        type: 'movie',
        year: 2023,
      },
    ])

    await expect(runTranscodeProcess()).resolves.toBeUndefined()
  })

  test('getTranscodingStatus should return a boolean', () => {
    expect(typeof getTranscodingStatus()).toBe('boolean')
  })
})
