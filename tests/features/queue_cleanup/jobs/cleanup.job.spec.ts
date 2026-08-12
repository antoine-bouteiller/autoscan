import { provideTest } from '@tests/effect'
import { expect, it } from '@tests/it'
import { mockQueueResponseEmpty } from '@tests/resources/fixtures/queue.fixtures'
import { mockRadarrQueue, mockSonarrQueue } from '@tests/utils'
import { Effect } from 'effect'

import { runCleanupProcess } from '@/features/queue_cleanup/jobs/cleanup.job'

it.live('runCleanupProcess invokes both queues', () =>
  Effect.gen(function* () {
    mockRadarrQueue.mockResolvedValue(mockQueueResponseEmpty)
    mockSonarrQueue.mockResolvedValue(mockQueueResponseEmpty)
    yield* provideTest(runCleanupProcess)
    expect(mockRadarrQueue).toHaveBeenCalled()
    expect(mockSonarrQueue).toHaveBeenCalled()
  })
)
