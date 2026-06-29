import { beforeEach, describe, expect, jest, spyOn, test } from 'bun:test'

import { container, TOKENS } from '#/core/container'
import { updatePlexSelectedLanguages } from '#/features/language_sync/jobs/language.job'
import { type PlexMedia } from '#/integrations/plex/plex.validator'
import { updateStreamMock } from '#tests/mocks/plex.mock'

import '../../../utils.ts'

const plexClient = container.resolve(TOKENS.PLEX_CLIENT)

describe('updatePlexSelectedLanguages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should iterate sections without throwing', async () => {
    spyOn(plexClient, 'getSections').mockResolvedValue([])
    expect(await updatePlexSelectedLanguages()).toBeUndefined()
  })

  test('should skip media with invalid metadata and continue', async () => {
    spyOn(plexClient, 'getSections').mockResolvedValue([{ key: 1, title: 'Movies', type: 'movie' as const }])
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
    spyOn(plexClient, 'getSectionMedia').mockResolvedValue(badMedia)

    expect(await updatePlexSelectedLanguages()).toBeUndefined()
    expect(updateStreamMock).not.toHaveBeenCalled()
  })

  test('should invoke handleUpdateLanguage for valid metadata', async () => {
    spyOn(plexClient, 'getSections').mockResolvedValue([{ key: 1, title: 'Movies', type: 'movie' as const }])
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
    spyOn(plexClient, 'getSectionMedia').mockResolvedValue(validMedia)

    await updatePlexSelectedLanguages()

    expect(updateStreamMock).not.toHaveBeenCalled()
  })
})
