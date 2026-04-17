import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { container, TOKENS } from '#core/container'
import { updatePlexSelectedLanguages } from '#features/language_sync/jobs/language.job'
import { type IPlexClient } from '#integrations/plex/plex.service'
import { type PlexMedia } from '#integrations/plex/plex.validator'

import { updateStreamMock } from '../../../mocks/plex.mock.js'
import '../../../utils.ts'

const plexClient = container.resolve<IPlexClient>(TOKENS.PLEX_CLIENT)

describe('updatePlexSelectedLanguages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should iterate sections without throwing', async () => {
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([])
    await expect(updatePlexSelectedLanguages()).resolves.toBeUndefined()
  })

  test('should skip media with invalid metadata and continue', async () => {
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([{ key: 1, title: 'Movies', type: 'movie' as const }])
    const badMedia: PlexMedia[] = [
      {
        Media: [],
        key: 'unknown-key',
        ratingKey: 'unknown',
        title: 'Unknown',
        type: 'movie',
        year: 2023,
      },
    ]
    vi.spyOn(plexClient, 'getSectionMedia').mockResolvedValue(badMedia)

    await expect(updatePlexSelectedLanguages()).resolves.toBeUndefined()
    expect(updateStreamMock).not.toHaveBeenCalled()
  })

  test('should invoke handleUpdateLanguage for valid metadata', async () => {
    vi.spyOn(plexClient, 'getSections').mockResolvedValue([{ key: 1, title: 'Movies', type: 'movie' as const }])
    const validMedia: PlexMedia[] = [
      {
        Media: [{ Part: [{ Stream: [], file: '/path/to/{tmdb-12345}/movie.mkv', id: 456 }] }],
        key: '/library/metadata/123',
        ratingKey: '123',
        title: 'Test Movie',
        type: 'movie',
        year: 2023,
      },
    ]
    vi.spyOn(plexClient, 'getSectionMedia').mockResolvedValue(validMedia)

    await updatePlexSelectedLanguages()

    expect(updateStreamMock).not.toHaveBeenCalled()
  })
})
