import { jest } from 'bun:test'

import { Effect } from 'effect'

import { type QueueResponse } from '@/integrations/arr/queue.types'
import { type ISonarrClient } from '@/integrations/arr/sonarr.service'

export const mockSonarrQueue = jest.fn<() => Promise<QueueResponse>>().mockResolvedValue({ records: [], totalRecords: 0 })
export const mockSonarrRemoveQueueItem = jest.fn<(id: number, options: unknown) => Promise<void>>().mockResolvedValue(undefined)

export class MockSonarrClient implements ISonarrClient {
  get getQueue() {
    return Effect.promise(() => mockSonarrQueue())
  }

  getSeriesByPath() {
    return Effect.void
  }

  refreshSeries() {
    return Effect.void
  }

  removeQueueItem(id: number, options: { blocklist: boolean; removeFromClient: boolean }) {
    return Effect.promise(() => mockSonarrRemoveQueueItem(id, options))
  }

  renameSeries() {
    return Effect.void
  }
}
