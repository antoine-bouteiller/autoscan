import { expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import { mockQueueResponseEmpty } from '@tests/resources/fixtures/queue.fixtures'
import { mockRadarrQueue, mockSonarrQueue } from '@tests/utils'

import { runCleanupProcess } from '@/features/queue_cleanup/jobs/cleanup.job'

test('runCleanupProcess invokes both queues', async () => {
  mockRadarrQueue.mockResolvedValue(mockQueueResponseEmpty)
  mockSonarrQueue.mockResolvedValue(mockQueueResponseEmpty)
  await runTest(runCleanupProcess)
  expect(mockRadarrQueue).toHaveBeenCalled()
  expect(mockSonarrQueue).toHaveBeenCalled()
})
