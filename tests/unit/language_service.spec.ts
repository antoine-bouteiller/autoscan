import { getLanguage, handleUpdateLanguage } from '@/app/services/media/language_service'
import type { PlexMediaStream } from '@/types/plex'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock the dependencies
const mockGetMediaByIdAndType = mock()
const mockGetLanguageByIdAndType = mock()
const mockUpdateStream = mock()

mock.module('@/app/services/media/media_service', () => ({
  getMediaByIdAndType: mockGetMediaByIdAndType,
}))

mock.module('@/app/services/integrations/tmdb_service', () => ({
  getLanguageByIdAndType: mockGetLanguageByIdAndType,
}))

mock.module('@/app/services/integrations/plex_service', () => ({
  updateStream: mockUpdateStream,
}))

describe('LanguageService', () => {
  beforeEach(() => {
    mockGetMediaByIdAndType.mockReset()
    mockGetLanguageByIdAndType.mockReset()
    mockUpdateStream.mockReset()
  })

  describe('getLanguage', () => {
    test('should return language from media details if available', async () => {
      mockGetMediaByIdAndType.mockResolvedValue({
        originalLanguage: 'fre',
        title: 'Test Movie',
        tmdbId: 123,
        type: 'movie',
      })

      const result = await getLanguage(123, 'movie')

      expect(result).toBe('fre')
      expect(mockGetMediaByIdAndType).toHaveBeenCalledWith(123, 'movie')
      expect(mockGetLanguageByIdAndType).not.toHaveBeenCalled()
    })

    test('should fetch from TMDB if media details not found', async () => {
      mockGetMediaByIdAndType.mockResolvedValue()
      mockGetLanguageByIdAndType.mockResolvedValue('spa')

      const result = await getLanguage(456, 'show')

      expect(result).toBe('spa')
      expect(mockGetMediaByIdAndType).toHaveBeenCalledWith(456, 'show')
      expect(mockGetLanguageByIdAndType).toHaveBeenCalledWith(456, 'show')
    })

    test('should return eng if no tmdbId provided', async () => {
      mockGetMediaByIdAndType.mockResolvedValue()

      const result = await getLanguage(0, 'movie')

      expect(result).toBe('eng')
      expect(mockGetLanguageByIdAndType).not.toHaveBeenCalled()
    })
  })

  describe('handleUpdateLanguage', () => {
    test('should update audio stream if original language stream found and not selected', async () => {
      const streams: PlexMediaStream[] = [
        {
          id: 1,
          languageCode: 'fra',
          selected: false,
          streamType: 2,
        },
        {
          id: 2,
          languageCode: 'eng',
          selected: true,
          streamType: 2,
        },
      ]

      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'fre',
        partsId: 123,
        streams,
      })

      expect(mockUpdateStream).toHaveBeenCalledWith({
        originalLanguage: 'fre',
        partsId: 123,
        subtitleStreamId: 1,
        type: 'audio',
      })
    })

    test('should not update if audio stream already selected', async () => {
      const streams: PlexMediaStream[] = [
        {
          id: 1,
          languageCode: 'eng',
          selected: true,
          streamType: 2,
        },
      ]

      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'eng',
        partsId: 123,
        streams,
      })

      expect(mockUpdateStream).not.toHaveBeenCalled()
    })

    test('should not update if no matching audio stream found', async () => {
      const streams: PlexMediaStream[] = [
        {
          id: 1,
          languageCode: 'eng',
          selected: false,
          streamType: 2,
        },
      ]

      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'spa',
        partsId: 123,
        streams,
      })

      expect(mockUpdateStream).not.toHaveBeenCalled()
    })

    test('should handle fre to fra conversion', async () => {
      const streams: PlexMediaStream[] = [
        {
          id: 1,
          languageCode: 'fra',
          selected: false,
          streamType: 2,
        },
      ]

      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'fre',
        partsId: 123,
        streams,
      })

      expect(mockUpdateStream).toHaveBeenCalledWith({
        originalLanguage: 'fre',
        partsId: 123,
        subtitleStreamId: 1,
        type: 'audio',
      })
    })

    test('should ignore non-audio streams', async () => {
      const streams: PlexMediaStream[] = [
        {
          id: 1,
          languageCode: 'eng',
          selected: false,
          streamType: 1, // video stream
        },
        {
          id: 2,
          languageCode: 'eng',
          selected: false,
          streamType: 3, // subtitle stream
        },
      ]

      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'eng',
        partsId: 123,
        streams,
      })

      expect(mockUpdateStream).not.toHaveBeenCalled()
    })
  })
})
