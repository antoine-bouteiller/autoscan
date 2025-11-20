import type { PlexMediaStream } from '@/types/plex'
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  mockAudioStreamFrench,
  mockAudioStreamNotMatching,
  mockAudioStreams,
  mockAudioStreamSelected,
  mockNonAudioStreams,
} from '../fixtures/media.fixtures'
import { mockUpdateStream } from '../mocks'

const { handleUpdateLanguage } = await import('@/app/services/media/language_service')

describe('LanguageService', () => {
  beforeEach(() => {
    mockUpdateStream.mockReset()
  })

  afterAll(() => {
    mockUpdateStream.mockRestore()
  })

  describe('handleUpdateLanguage', () => {
    test('should update audio stream if original language stream found and not selected', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'fr',
        partsId: 123,
        streams: mockAudioStreams,
      })

      expect(mockUpdateStream).toHaveBeenCalledWith(123, 0, 'audio')
    })

    test('should not update if audio stream already selected', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'en',
        partsId: 123,
        streams: mockAudioStreamSelected,
      })

      expect(mockUpdateStream).not.toHaveBeenCalled()
    })

    test('should not update if no matching audio stream found', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'es',
        partsId: 123,
        streams: mockAudioStreamNotMatching,
      })

      expect(mockUpdateStream).not.toHaveBeenCalled()
    })

    test('should handle fre to fr conversion', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'fr',
        partsId: 123,
        streams: mockAudioStreamFrench,
      })

      // For French, stream ID should be 0
      expect(mockUpdateStream).toHaveBeenCalledWith(123, 0, 'audio')
    })

    test('should use audio stream ID for non-French languages', async () => {
      const mockEngStream: PlexMediaStream[] = [
        {
          id: 5,
          languageCode: 'eng',
          selected: false,
          streamType: 2,
        },
      ]

      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'en',
        partsId: 456,
        streams: mockEngStream,
      })

      // For English (non-French), should use the actual stream ID (5)
      expect(mockUpdateStream).toHaveBeenCalledWith(456, 5, 'audio')
    })

    test('should ignore non-audio streams', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        originalLanguage: 'en',
        partsId: 123,
        streams: mockNonAudioStreams,
      })

      expect(mockUpdateStream).not.toHaveBeenCalled()
    })
  })
})
