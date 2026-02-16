import { beforeEach, describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import type { PlexMediaStream } from '@/schemas/plex'

import { LanguageService } from '@/services/language.service'

import { MockPlexLayer, updateStreamMock } from '../mocks/plex.mock'
import {
  mockAudioStreamFrench,
  mockAudioStreamNotMatching,
  mockAudioStreams,
  mockAudioStreamSelected,
  mockNonAudioStreams,
} from '../resources/fixtures/media.fixtures'

const TestLayer = LanguageService.DefaultWithoutDependencies.pipe(Layer.provide(MockPlexLayer))

describe('LanguageService', () => {
  beforeEach(() => {
    updateStreamMock.mockRestore()
  })

  describe('handleUpdateLanguage', () => {
    it.effect('should update audio stream if original language stream found and not selected', () =>
      Effect.gen(function* () {
        const lang = yield* LanguageService
        yield* lang.handleUpdateLanguage({
          mediaTitle: 'Test Movie',
          partsId: 123,
          preferredLanguage: 'fr',
          streams: mockAudioStreams,
        })
        expect(updateStreamMock).toHaveBeenCalledWith(123, 1, 'audio')
        expect(updateStreamMock).toHaveBeenCalledWith(123, 0, 'subtitle')
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('should not update if audio stream already selected', () =>
      Effect.gen(function* () {
        const lang = yield* LanguageService
        yield* lang.handleUpdateLanguage({
          mediaTitle: 'Test Movie',
          partsId: 123,
          preferredLanguage: 'en',
          streams: mockAudioStreamSelected,
        })
        expect(updateStreamMock).not.toHaveBeenCalled()
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('should not update if no matching audio stream found', () =>
      Effect.gen(function* () {
        const lang = yield* LanguageService
        yield* lang.handleUpdateLanguage({
          mediaTitle: 'Test Movie',
          partsId: 123,
          preferredLanguage: 'es',
          streams: mockAudioStreamNotMatching,
        })
        expect(updateStreamMock).not.toHaveBeenCalled()
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('should handle fre to fr conversion', () =>
      Effect.gen(function* () {
        const lang = yield* LanguageService
        yield* lang.handleUpdateLanguage({
          mediaTitle: 'Test Movie',
          partsId: 123,
          preferredLanguage: 'fr',
          streams: mockAudioStreamFrench,
        })
        expect(updateStreamMock).toHaveBeenCalledWith(123, 1, 'audio')
        expect(updateStreamMock).toHaveBeenCalledWith(123, 0, 'subtitle')
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect('should use audio stream ID for non-French languages', () => {
      const mockEngStream: PlexMediaStream[] = [
        {
          id: 5,
          languageCode: 'eng',
          selected: false,
          streamType: 2,
        },
      ]

      return Effect.gen(function* () {
        const lang = yield* LanguageService
        yield* lang.handleUpdateLanguage({
          mediaTitle: 'Test Movie',
          partsId: 456,
          preferredLanguage: 'en',
          streams: mockEngStream,
        })
        expect(updateStreamMock).toHaveBeenCalledWith(456, 5, 'audio')
      }).pipe(Effect.provide(TestLayer))
    })

    it.effect('should ignore non-audio streams', () =>
      Effect.gen(function* () {
        const lang = yield* LanguageService
        yield* lang.handleUpdateLanguage({
          mediaTitle: 'Test Movie',
          partsId: 123,
          preferredLanguage: 'en',
          streams: mockNonAudioStreams,
        })
        expect(updateStreamMock).not.toHaveBeenCalled()
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
