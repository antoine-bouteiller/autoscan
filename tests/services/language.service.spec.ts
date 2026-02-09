import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import type { PlexMediaStream } from '@/validators/plex.validator'

import { container, TOKENS } from '@/core/container'

import '../config'
import type { TestPlexClient } from '../mocks'

import {
  mockAudioStreamFrench,
  mockAudioStreamNotMatching,
  mockAudioStreams,
  mockAudioStreamSelected,
  mockNonAudioStreams,
} from '../resources/fixtures/media.fixtures'

const { handleUpdateLanguage } = await import('@/services/language.service')

describe('LanguageService', () => {
  let testPlexClient: TestPlexClient

  beforeEach(() => {
    testPlexClient = container.resolve<TestPlexClient>(TOKENS.PLEX_CLIENT)

    testPlexClient.updateStream.mockReset()
  })

  afterAll(() => {
    testPlexClient.updateStream.mockRestore()
  })

  describe('handleUpdateLanguage', () => {
    test('should update audio stream if original language stream found and not selected', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'fr',
        streams: mockAudioStreams,
      })

      expect(testPlexClient.updateStream).toHaveBeenCalledWith(123, 1, 'audio')
      expect(testPlexClient.updateStream).toHaveBeenCalledWith(123, 0, 'subtitle')
    })

    test('should not update if audio stream already selected', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'en',
        streams: mockAudioStreamSelected,
      })

      expect(testPlexClient.updateStream).not.toHaveBeenCalled()
    })

    test('should not update if no matching audio stream found', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'es',
        streams: mockAudioStreamNotMatching,
      })

      expect(testPlexClient.updateStream).not.toHaveBeenCalled()
    })

    test('should handle fre to fr conversion', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'fr',
        streams: mockAudioStreamFrench,
      })

      // For French, stream ID should be 0
      expect(testPlexClient.updateStream).toHaveBeenCalledWith(123, 1, 'audio')
      expect(testPlexClient.updateStream).toHaveBeenCalledWith(123, 0, 'subtitle')
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

      // For English (non-French), should use the actual stream ID (5)
      expect(testPlexClient.updateStream).toHaveBeenCalledWith(456, 5, 'audio')
    })

    test('should ignore non-audio streams', async () => {
      await handleUpdateLanguage({
        mediaTitle: 'Test Movie',
        partsId: 123,
        preferredLanguage: 'en',
        streams: mockNonAudioStreams,
      })

      expect(testPlexClient.updateStream).not.toHaveBeenCalled()
    })
  })
})
