import { beforeEach, describe, expect, test } from 'bun:test'

import { container, TOKENS } from '@/core/container'

import '../config'
import type { TestRadarrClient, TestSonarrClient } from '../mocks'

import {
  mockQueueResponseEmpty,
  mockQueueResponseNormal,
  mockQueueResponseWithDangerousFiles,
  mockQueueResponseWithNoEligibleFiles,
  mockQueueResponseWithStalledWarning,
} from '../resources/fixtures/queue.fixtures'

const { cleanupAll } = await import('@/services/cleanup.service')

describe('CleanupService', () => {
  let testSonarrClient: TestSonarrClient
  let testRadarrClient: TestRadarrClient

  beforeEach(() => {
    testSonarrClient = container.resolve<TestSonarrClient>(TOKENS.SONARR_CLIENT)
    testRadarrClient = container.resolve<TestRadarrClient>(TOKENS.RADARR_CLIENT)

    testSonarrClient.getQueue.mockReset()
    testSonarrClient.removeQueueItem.mockReset()
    testRadarrClient.getQueue.mockReset()
    testRadarrClient.removeQueueItem.mockReset()
  })

  test('should remove items with no eligible files', async () => {
    testSonarrClient.getQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    testRadarrClient.getQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    testSonarrClient.removeQueueItem.mockResolvedValue(undefined)
    testRadarrClient.removeQueueItem.mockResolvedValue(undefined)

    await cleanupAll()

    expect(testSonarrClient.removeQueueItem).toHaveBeenCalledTimes(1)
    expect(testRadarrClient.removeQueueItem).toHaveBeenCalledTimes(1)
    expect(testSonarrClient.removeQueueItem).toHaveBeenCalledWith(1, {
      blocklist: true,
      removeFromClient: true,
    })
  })

  test('should remove items with dangerous file extensions', async () => {
    testSonarrClient.getQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)
    testRadarrClient.getQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)
    testSonarrClient.removeQueueItem.mockResolvedValue(undefined)
    testRadarrClient.removeQueueItem.mockResolvedValue(undefined)

    await cleanupAll()

    expect(testSonarrClient.removeQueueItem).toHaveBeenCalledTimes(1)
    expect(testRadarrClient.removeQueueItem).toHaveBeenCalledTimes(1)
  })

  test('should not remove items with stalled warning on first strike', async () => {
    testSonarrClient.getQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)
    testRadarrClient.getQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)

    await cleanupAll()

    expect(testSonarrClient.removeQueueItem).not.toHaveBeenCalled()
    expect(testRadarrClient.removeQueueItem).not.toHaveBeenCalled()
  })

  test('should handle empty queue', async () => {
    testSonarrClient.getQueue.mockResolvedValue(mockQueueResponseEmpty)
    testRadarrClient.getQueue.mockResolvedValue(mockQueueResponseEmpty)

    await cleanupAll()

    expect(testSonarrClient.removeQueueItem).not.toHaveBeenCalled()
    expect(testRadarrClient.removeQueueItem).not.toHaveBeenCalled()
  })

  test('should handle undefined queue response', async () => {
    testSonarrClient.getQueue.mockResolvedValue({})
    testRadarrClient.getQueue.mockResolvedValue({})

    await cleanupAll()

    expect(testSonarrClient.removeQueueItem).not.toHaveBeenCalled()
    expect(testRadarrClient.removeQueueItem).not.toHaveBeenCalled()
  })

  test('should skip items with missing title or status', async () => {
    await cleanupAll()

    expect(testSonarrClient.removeQueueItem).not.toHaveBeenCalled()
    expect(testRadarrClient.removeQueueItem).not.toHaveBeenCalled()
  })

  test('should handle normal completed items without errors', async () => {
    testSonarrClient.getQueue.mockResolvedValue(mockQueueResponseNormal)
    testRadarrClient.getQueue.mockResolvedValue(mockQueueResponseNormal)

    await cleanupAll()

    expect(testSonarrClient.removeQueueItem).not.toHaveBeenCalled()
    expect(testRadarrClient.removeQueueItem).not.toHaveBeenCalled()
  })
})
