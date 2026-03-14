import { vi } from 'vite-plus/test'

import type { IRadarrClient } from '#integrations/arr/radarr.service'

export const mockRadarrQueue = vi.fn<IRadarrClient['getQueue']>()
export const mockRadarrRemoveQueueItem = vi.fn<IRadarrClient['removeQueueItem']>()

export class MockRadarrClient implements IRadarrClient {
  getQueue = mockRadarrQueue

  async getMovieByPath() {
    return undefined
  }

  async refreshMovie() {
    return
  }

  removeQueueItem = mockRadarrRemoveQueueItem

  async renameMovie() {
    return
  }
}
