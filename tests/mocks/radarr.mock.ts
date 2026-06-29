import { jest } from 'bun:test'

import { type IRadarrClient } from '#/integrations/arr/radarr.service'

export const mockRadarrQueue = jest.fn<IRadarrClient['getQueue']>()
export const mockRadarrRemoveQueueItem = jest.fn<IRadarrClient['removeQueueItem']>()

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
