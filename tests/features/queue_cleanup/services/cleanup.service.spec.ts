import { beforeEach, describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import {
  mockQueueResponseEmpty,
  mockQueueResponseNormal,
  mockQueueResponseWithDangerousFiles,
  mockQueueResponseWithNoEligibleFiles,
  mockQueueResponseWithStalledWarning,
} from '@tests/resources/fixtures/queue.fixtures'
import { mockRadarrQueue, mockRadarrRemoveQueueItem, mockSonarrQueue, mockSonarrRemoveQueueItem } from '@tests/utils'

import { cleanupAll } from '@/features/queue_cleanup/services/cleanup.service'

describe('cleanupAll', () => {
  beforeEach(() => {
    mockRadarrQueue.mockReset().mockResolvedValue(mockQueueResponseEmpty)
    mockSonarrQueue.mockReset().mockResolvedValue(mockQueueResponseEmpty)
    mockRadarrRemoveQueueItem.mockReset().mockResolvedValue(undefined)
    mockSonarrRemoveQueueItem.mockReset().mockResolvedValue(undefined)
  })

  test('removes downloads with no eligible files', async () => {
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    await runTest(cleanupAll)
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledWith(1, { blocklist: true, removeFromClient: true })
  })

  test('removes dangerous downloads', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)
    await runTest(cleanupAll)
    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledWith(2, { blocklist: true, removeFromClient: true })
  })

  test('does not remove a first stalled strike', async () => {
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)
    await runTest(cleanupAll)
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('handles empty and normal queues', async () => {
    mockRadarrQueue.mockResolvedValue(mockQueueResponseNormal)
    expect(await runTest(cleanupAll)).toBeUndefined()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })
})
