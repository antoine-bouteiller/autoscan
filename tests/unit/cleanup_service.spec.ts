import { beforeEach, describe, expect, test } from 'bun:test'

import {
  mockQueueResponseEmpty,
  mockQueueResponseNormal,
  mockQueueResponseWithDangerousFiles,
  mockQueueResponseWithMissingFields,
  mockQueueResponseWithNoEligibleFiles,
  mockQueueResponseWithStalledWarning,
} from '../fixtures/queue.fixtures'
import {
  mockRadarrGetQueue,
  mockRadarrRemoveQueueItem,
  mockSonarrGetQueue,
  mockSonarrRemoveQueueItem,
} from '../mocks'

const { cleanupAll } = await import('@/app/services/downloads/cleanup_service')

describe('CleanupService', () => {
  beforeEach(() => {
    mockSonarrGetQueue.mockReset()
    mockSonarrRemoveQueueItem.mockReset()
    mockRadarrGetQueue.mockReset()
    mockRadarrRemoveQueueItem.mockReset()
  })

  test('should remove items with no eligible files', async () => {
    mockSonarrGetQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    mockRadarrGetQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    mockSonarrRemoveQueueItem.mockResolvedValue(undefined)
    mockRadarrRemoveQueueItem.mockResolvedValue(undefined)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledWith(1, {
      blocklist: true,
      removeFromClient: true,
    })
  })

  test('should remove items with dangerous file extensions', async () => {
    mockSonarrGetQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)
    mockRadarrGetQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)
    mockSonarrRemoveQueueItem.mockResolvedValue(undefined)
    mockRadarrRemoveQueueItem.mockResolvedValue(undefined)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledTimes(1)
  })

  test('should not remove items with stalled warning on first strike', async () => {
    mockSonarrGetQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)
    mockRadarrGetQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should handle empty queue', async () => {
    mockSonarrGetQueue.mockResolvedValue(mockQueueResponseEmpty)
    mockRadarrGetQueue.mockResolvedValue(mockQueueResponseEmpty)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should handle undefined queue response', async () => {
    mockSonarrGetQueue.mockResolvedValue({})
    mockRadarrGetQueue.mockResolvedValue({})

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should skip items with missing title or status', async () => {
    mockSonarrGetQueue.mockResolvedValue(mockQueueResponseWithMissingFields)
    mockRadarrGetQueue.mockResolvedValue(mockQueueResponseWithMissingFields)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should handle normal completed items without errors', async () => {
    mockSonarrGetQueue.mockResolvedValue(mockQueueResponseNormal)
    mockRadarrGetQueue.mockResolvedValue(mockQueueResponseNormal)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })
})
