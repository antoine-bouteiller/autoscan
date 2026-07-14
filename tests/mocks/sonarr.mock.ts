import { jest } from 'bun:test'

import { type ISonarrClient } from '@/integrations/arr/sonarr.service'

export const mockSonarrQueue = jest.fn<ISonarrClient['getQueue']>()
export const mockSonarrRemoveQueueItem = jest.fn<ISonarrClient['removeQueueItem']>()

export class MockSonarrClient implements ISonarrClient {
  getQueue = mockSonarrQueue

  async getSeriesByPath() {
    return undefined
  }

  async refreshSeries() {
    return
  }

  removeQueueItem = mockSonarrRemoveQueueItem

  async renameSeries() {
    return
  }
}
