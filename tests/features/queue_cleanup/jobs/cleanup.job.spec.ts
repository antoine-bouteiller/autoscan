import { beforeEach, describe, expect, test } from 'bun:test'

import { mockRadarrQueue, mockRadarrRemoveQueueItem } from '@tests/mocks/radarr.mock'
import { mockSonarrQueue, mockSonarrRemoveQueueItem } from '@tests/mocks/sonarr.mock'
import { mockQueueResponseWithNoEligibleFiles } from '@tests/resources/fixtures/queue.fixtures'

import { runCleanupProcess } from '@/features/queue_cleanup/jobs/cleanup.job'

import '../../../utils.ts'

describe('runCleanupProcess', () => {
  beforeEach(() => {
    mockSonarrQueue.mockReset()
    mockSonarrRemoveQueueItem.mockReset()
    mockRadarrQueue.mockReset()
    mockRadarrRemoveQueueItem.mockReset()
  })

  test('should invoke cleanup on both Sonarr and Radarr queues', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)

    await runCleanupProcess()

    expect(mockSonarrQueue).toHaveBeenCalledTimes(1)
    expect(mockRadarrQueue).toHaveBeenCalledTimes(1)
    expect(mockSonarrRemoveQueueItem).toHaveBeenCalled()
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalled()
  })
})
