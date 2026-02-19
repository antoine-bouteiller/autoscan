import { beforeEach, describe, expect, test } from 'vitest'

import type { PlexMediaStream } from '@/validators/plex.validator'

import '../config'
import { updateStreamMock } from '../mocks/plex.mock'
import {
  mockAudioStreamFrench,
  mockAudioStreamNotMatching,
  mockAudioStreams,
  mockAudioStreamSelected,
  mockNonAudioStreams,
} from '../resources/fixtures/media.fixtures'

const { handleUpdateLanguage } = await import('@/services/language.service')

describe('LanguageService', () => {
  beforeEach(() => {
    updateStreamMock.mockRestore()
  })

  describe('handleUpdateLanguage', () => {
    test('should update audio stream if original language stream found and not selected', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'fr',
        streams: mockAudioStreams,
      })

      expect(updateStreamMock).toHaveBeenCalledWith(123, 1, 'audio')
      expect(updateStreamMock).toHaveBeenCalledWith(123, 0, 'subtitle')
    })

    test('should not update if audio stream already selected', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'en',
        streams: mockAudioStreamSelected,
      })

      expect(updateStreamMock).not.toHaveBeenCalled()
    })

    test('should not update if no matching audio stream found', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'es',
        streams: mockAudioStreamNotMatching,
      })

      expect(updateStreamMock).not.toHaveBeenCalled()
    })

    test('should handle fre to fr conversion', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'fr',
        streams: mockAudioStreamFrench,
      })

      expect(updateStreamMock).toHaveBeenCalledWith(123, 1, 'audio')
      expect(updateStreamMock).toHaveBeenCalledWith(123, 0, 'subtitle')
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
        partsId: 456,
        preferredLanguage: 'en',
        streams: mockEngStream,
      })

      expect(updateStreamMock).toHaveBeenCalledWith(456, 5, 'audio')
    })

    test('should ignore non-audio streams', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'en',
        streams: mockNonAudioStreams,
      })

      expect(updateStreamMock).not.toHaveBeenCalled()
    })
  })
})
