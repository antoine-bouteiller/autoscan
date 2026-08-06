import { jest } from 'bun:test'

import { Effect } from 'effect'

import { type QueueResponse } from '@/integrations/arr/queue.types'
import { type IRadarrClient } from '@/integrations/arr/radarr.service'

export const mockRadarrQueue = jest.fn<() => Promise<QueueResponse>>().mockResolvedValue({ records: [], totalRecords: 0 })
export const mockRadarrRemoveQueueItem = jest.fn<(id: number, options: unknown) => Promise<void>>().mockResolvedValue(undefined)

export class MockRadarrClient implements IRadarrClient {
  getQueue() {
    return Effect.promise(() => mockRadarrQueue())
  }

  getMovieByPath() {
    return Effect.succeed(undefined)
  }

  refreshMovie() {
    return Effect.void
  }

  removeQueueItem(id: number, options: { blocklist: boolean; removeFromClient: boolean }) {
    return Effect.promise(() => mockRadarrRemoveQueueItem(id, options))
  }

  renameMovie() {
    return Effect.void
  }
}
