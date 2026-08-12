import { jest } from 'bun:test'

import { Effect } from 'effect'

import { type QueueResponse } from '@/integrations/arr/queue.types'
import { type IRadarrClient } from '@/integrations/arr/radarr.service'
import { type HttpClientError } from '@/shared/types/http_client'

export const mockRadarrQueue = jest.fn<() => Promise<QueueResponse>>().mockResolvedValue({ records: [], totalRecords: 0 })
export const mockRadarrRemoveQueueItem = jest.fn<(id: number, options: unknown) => Promise<void>>().mockResolvedValue(undefined)

export class MockRadarrClient implements IRadarrClient {
  getQueue() {
    return Effect.promise(() => mockRadarrQueue())
  }

  getMovieByPath(): Effect.Effect<number | undefined, HttpClientError> {
    // oxlint-disable-next-line effecttsgo/effect-succeed-with-void -- success channel is number | undefined, not void
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
