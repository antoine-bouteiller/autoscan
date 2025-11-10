import {
  getMediaDetails,
  getSectionMedia,
  getSections,
  refreshSection,
  updateStream,
} from '@/app/services/integrations/plex_service'
import type { PlexMedia, PlexReponse } from '@/types/plex'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock ky
const mockKyGet = mock()
const mockKyPut = mock()
const mockKyInstance = {
  get: mockKyGet,
  put: mockKyPut,
}

mock.module('ky', () => ({
  default: {
    create: () => mockKyInstance,
  },
}))

// Mock language_service
const mockGetLanguage = mock()
mock.module('@/app/services/media/language_service', () => ({
  getLanguage: mockGetLanguage,
}))

// Mock env
mock.module('@/config/env', () => ({
  default: {
    PLEX_TOKEN: 'test-token',
    PLEX_URL: 'http://plex.test',
  },
}))

describe('PlexService', () => {
  beforeEach(() => {
    mockKyGet.mockReset()
    mockKyPut.mockReset()
    mockGetLanguage.mockReset()
  })

  describe('getMediaDetails', () => {
    test('should return media details for movie', async () => {
      const plexMedia: PlexMedia = {
        Media: [
          {
            Part: [
              {
                file: '/path/to/{tmdb-12345}/movie.mkv',
              },
            ],
          },
        ],
        ratingKey: '123',
        title: 'Test Movie',
        type: 'movie',
      }

      const mockResponse: PlexReponse = {
        MediaContainer: {
          Metadata: [
            {
              Media: [
                {
                  Part: [
                    {
                      Stream: [],
                      id: 456,
                    },
                  ],
                },
              ],
            },
          ],
        },
      }

      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue(mockResponse),
      })
      mockGetLanguage.mockResolvedValue('eng')

      const result = await getMediaDetails(plexMedia)

      expect(result).toEqual({
        file: '/path/to/{tmdb-12345}/movie.mkv',
        mediaTitle: 'Test Movie',
        originalLanguage: 'eng',
        partsId: 456,
        streams: [],
        tmdbId: 12_345,
      })
      expect(mockGetLanguage).toHaveBeenCalledWith(12_345, 'movie')
    })

    test('should return media details for episode', async () => {
      const plexMedia: PlexMedia = {
        Media: [
          {
            Part: [
              {
                file: '/path/to/{tmdb-67890}/S01E01.mkv',
              },
            ],
          },
        ],
        grandparentTitle: 'Test Show',
        parentTitle: 'Season 1',
        ratingKey: '789',
        title: 'Episode 1',
        type: 'episode',
      }

      const mockResponse: PlexReponse = {
        MediaContainer: {
          Metadata: [
            {
              Media: [
                {
                  Part: [
                    {
                      Stream: [],
                      id: 999,
                    },
                  ],
                },
              ],
            },
          ],
        },
      }

      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue(mockResponse),
      })
      mockGetLanguage.mockResolvedValue('fre')

      const result = await getMediaDetails(plexMedia)

      expect(result).toEqual({
        file: '/path/to/{tmdb-67890}/S01E01.mkv',
        mediaTitle: 'Test Show - Season 1 - Episode 1',
        originalLanguage: 'fre',
        partsId: 999,
        streams: [],
        tmdbId: 67_890,
      })
      expect(mockGetLanguage).toHaveBeenCalledWith(67_890, 'show')
    })

    test('should throw error if no file found', async () => {
      const plexMedia: PlexMedia = {
        Media: [],
        ratingKey: '123',
        title: 'Test Movie',
        type: 'movie',
      }

      await expect(getMediaDetails(plexMedia)).rejects.toThrow('[Test Movie] No file found"')
    })

    test('should throw error if no tmdbId found', async () => {
      const plexMedia: PlexMedia = {
        Media: [
          {
            Part: [
              {
                file: '/path/to/movie.mkv',
              },
            ],
          },
        ],
        ratingKey: '123',
        title: 'Test Movie',
        type: 'movie',
      }

      await expect(getMediaDetails(plexMedia)).rejects.toThrow('[Test Movie] No tmdbId found"')
    })

    test('should throw error if no part found in response', async () => {
      const plexMedia: PlexMedia = {
        Media: [
          {
            Part: [
              {
                file: '/path/to/{tmdb-12345}/movie.mkv',
              },
            ],
          },
        ],
        ratingKey: '123',
        title: 'Test Movie',
        type: 'movie',
      }

      const mockResponse: PlexReponse = {
        MediaContainer: {
          Metadata: [],
        },
      }

      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue(mockResponse),
      })
      mockGetLanguage.mockResolvedValue('eng')

      await expect(getMediaDetails(plexMedia)).rejects.toThrow('[Test Movie] No part found"')
    })
  })

  describe('getSectionMedia', () => {
    test('should get movies from section', async () => {
      const mockResponse: PlexReponse = {
        MediaContainer: {
          Metadata: [{ ratingKey: '1', title: 'Movie 1', type: 'movie' }],
        },
      }

      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue(mockResponse),
      })

      const result = await getSectionMedia(1, 'movie')

      expect(result).toEqual([{ ratingKey: '1', title: 'Movie 1', type: 'movie' }])
    })

    test('should get shows from section', async () => {
      const mockResponse: PlexReponse = {
        MediaContainer: {
          Metadata: [{ ratingKey: '2', title: 'Show 1', type: 'episode' } as PlexMedia],
        },
      }

      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue(mockResponse),
      })

      const result = await getSectionMedia(2, 'show')

      expect(result).toEqual([{ ratingKey: '2', title: 'Show 1', type: 'episode' } as PlexMedia])
    })
  })

  describe('getSections', () => {
    test('should return all sections', async () => {
      const mockResponse: PlexReponse = {
        MediaContainer: {
          Directory: [
            { key: 1, title: 'Movies', type: 'movie' },
            { key: 2, title: 'TV Shows', type: 'show' },
          ],
        },
      }

      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue(mockResponse),
      })

      const result = await getSections()

      expect(result).toEqual([
        { key: 1, title: 'Movies', type: 'movie' },
        { key: 2, title: 'TV Shows', type: 'show' },
      ])
    })
  })

  describe('refreshSection', () => {
    test('should refresh section with file path', async () => {
      mockKyGet.mockResolvedValue({})

      await refreshSection(1, '/path/to/media')

      expect(mockKyGet).toHaveBeenCalledWith('library/sections/1/refresh', {
        searchParams: {
          path: '/path/to/media',
        },
      })
    })
  })

  describe('updateStream', () => {
    test('should update audio stream', async () => {
      mockKyPut.mockResolvedValue({})

      await updateStream({
        originalLanguage: 'eng',
        partsId: 123,
        subtitleStreamId: 456,
        type: 'audio',
      })

      expect(mockKyPut).toHaveBeenCalledWith('library/parts/123?audioStreamID=456', {
        searchParams: { allParts: 1 },
      })
    })

    test('should update subtitle stream', async () => {
      mockKyPut.mockResolvedValue({})

      await updateStream({
        originalLanguage: 'spa',
        partsId: 789,
        subtitleStreamId: 999,
        type: 'subtitle',
      })

      expect(mockKyPut).toHaveBeenCalledWith('library/parts/789?subtitleStreamID=999', {
        searchParams: { allParts: 1 },
      })
    })

    test('should set stream to 0 for fra language', async () => {
      mockKyPut.mockResolvedValue({})

      await updateStream({
        originalLanguage: 'fra',
        partsId: 111,
        subtitleStreamId: 222,
        type: 'audio',
      })

      expect(mockKyPut).toHaveBeenCalledWith('library/parts/111?audioStreamID=0', {
        searchParams: { allParts: 1 },
      })
    })
  })
})
