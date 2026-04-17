import { beforeEach, describe, expect, test } from 'vite-plus/test'

import { runCleanupProcess } from '#features/queue_cleanup/jobs/cleanup.job'

import '../../../utils.ts'
import { mockRadarrQueue, mockRadarrRemoveQueueItem } from '../../../mocks/radarr.mock.js'
import { mockSonarrQueue, mockSonarrRemoveQueueItem } from '../../../mocks/sonarr.mock.js'
import { mockQueueResponseWithNoEligibleFiles } from '../../../resources/fixtures/queue.fixtures.js'

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
