import { beforeEach, describe, expect, test } from 'vite-plus/test'

import '../../../utils.ts'
import { mockRadarrQueue, mockRadarrRemoveQueueItem } from '../../../mocks/radarr.mock.js'
import { mockSonarrQueue, mockSonarrRemoveQueueItem } from '../../../mocks/sonarr.mock.js'
import {
  mockQueueResponseEmpty,
  mockQueueResponseNormal,
  mockQueueResponseWithDangerousFiles,
  mockQueueResponseWithNoEligibleFiles,
  mockQueueResponseWithStalledWarning,
} from '../../../resources/fixtures/queue.fixtures.js'

const { cleanupAll } = await import('#features/queue_cleanup/services/cleanup.service')

describe('CleanupService', () => {
  beforeEach(() => {
    mockSonarrQueue.mockReset()
    mockSonarrRemoveQueueItem.mockReset()
    mockRadarrQueue.mockReset()
    mockRadarrRemoveQueueItem.mockReset()
  })

  test('should remove items with no eligible files', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledWith(1, {
      blocklist: true,
      removeFromClient: true,
    })
  })

  test('should remove items with dangerous file extensions', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledTimes(1)
  })

  test('should not remove items with stalled warning on first strike', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should handle empty queue', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseEmpty)
    mockRadarrQueue.mockResolvedValue(mockQueueResponseEmpty)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should handle undefined queue response', async () => {
    mockSonarrQueue.mockResolvedValue({ records: [], totalRecords: 0 })
    mockRadarrQueue.mockResolvedValue({ records: [], totalRecords: 0 })

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should skip items with missing title or status', async () => {
    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('should handle normal completed items without errors', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseNormal)
    mockRadarrQueue.mockResolvedValue(mockQueueResponseNormal)

    await cleanupAll()

    expect(mockSonarrRemoveQueueItem).not.toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })
})
