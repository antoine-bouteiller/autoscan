import { beforeEach, describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { CleanupService } from '@/services/cleanup.service'

import { MockRadarrLayer, mockRadarrQueue, mockRadarrRemoveQueueItem } from '../mocks/radarr.mock'
import { MockSonarrLayer, mockSonarrQueue, mockSonarrRemoveQueueItem } from '../mocks/sonarr.mock'
import {
  mockQueueResponseEmpty,
  mockQueueResponseNormal,
  mockQueueResponseWithDangerousFiles,
  mockQueueResponseWithNoEligibleFiles,
  mockQueueResponseWithStalledWarning,
} from '../resources/fixtures/queue.fixtures'

const TestLayer = CleanupService.DefaultWithoutDependencies.pipe(Layer.provide(Layer.mergeAll(MockSonarrLayer, MockRadarrLayer)))

describe('CleanupService', () => {
  beforeEach(() => {
    mockSonarrQueue.mockReset()
    mockSonarrRemoveQueueItem.mockReset()
    mockRadarrQueue.mockReset()
    mockRadarrRemoveQueueItem.mockReset()
  })

  it.effect('should remove items with no eligible files', () => {
    mockSonarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseWithNoEligibleFiles))
    mockRadarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseWithNoEligibleFiles))

    return Effect.gen(function* () {
      const cleanup = yield* CleanupService
      yield* cleanup.cleanupAll()
      expect(mockSonarrRemoveQueueItem).toHaveBeenCalledTimes(1)
      expect(mockRadarrRemoveQueueItem).toHaveBeenCalledTimes(1)
      expect(mockSonarrRemoveQueueItem).toHaveBeenCalledWith(1, {
        blocklist: true,
        removeFromClient: true,
      })
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect('should remove items with dangerous file extensions', () => {
    mockSonarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseWithDangerousFiles))
    mockRadarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseWithDangerousFiles))

    return Effect.gen(function* () {
      const cleanup = yield* CleanupService
      yield* cleanup.cleanupAll()
      expect(mockSonarrRemoveQueueItem).toHaveBeenCalledTimes(1)
      expect(mockRadarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect('should not remove items with stalled warning on first strike', () => {
    mockSonarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseWithStalledWarning))
    mockRadarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseWithStalledWarning))

    return Effect.gen(function* () {
      const cleanup = yield* CleanupService
      yield* cleanup.cleanupAll()
      expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
      expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect('should handle empty queue', () => {
    mockSonarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseEmpty))
    mockRadarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseEmpty))

    return Effect.gen(function* () {
      const cleanup = yield* CleanupService
      yield* cleanup.cleanupAll()
      expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
      expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect('should handle undefined queue response', () => {
    mockSonarrQueue.mockImplementation(() => Effect.succeed({ records: [], totalRecords: 0 }))
    mockRadarrQueue.mockImplementation(() => Effect.succeed({ records: [], totalRecords: 0 }))

    return Effect.gen(function* () {
      const cleanup = yield* CleanupService
      yield* cleanup.cleanupAll()
      expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
      expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
    }).pipe(Effect.provide(TestLayer))
  })

  it.effect('should handle normal completed items without errors', () => {
    mockSonarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseNormal))
    mockRadarrQueue.mockImplementation(() => Effect.succeed(mockQueueResponseNormal))

    return Effect.gen(function* () {
      const cleanup = yield* CleanupService
      yield* cleanup.cleanupAll()
      expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
      expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
    }).pipe(Effect.provide(TestLayer))
  })
})
