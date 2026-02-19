import { vi } from 'vitest'

import type { IRadarrClient } from '@/integrations/arr/radarr.service'

export const mockRadarrQueue = vi.fn<IRadarrClient['getQueue']>()
export const mockRadarrRemoveQueueItem = vi.fn<IRadarrClient['removeQueueItem']>()

export class MockRadarrClient implements IRadarrClient {
  async getQueue() {
    return mockRadarrQueue()
  }

  async getMovieByPath(_filePath: string) {
    return undefined
  }

  async refreshMovie(_movieId: number) {
    return
  }

  async removeQueueItem(id: number, options: { blocklist: boolean; removeFromClient: boolean }) {
    void mockRadarrRemoveQueueItem(id, options)
  }

  async renameMovie(_movieId: number) {
    return
  }
}
