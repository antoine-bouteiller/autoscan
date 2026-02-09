import { mock } from 'bun:test'

import type { ISonarrClient } from '@/integrations/arr/sonarr.service'

export const mockSonarrQueue = mock<ISonarrClient['getQueue']>()
export const mockSonarrRemoveQueueItem = mock<ISonarrClient['removeQueueItem']>()

export class MockSonarrClient implements ISonarrClient {
  async getQueue() {
    return mockSonarrQueue()
  }

  async getSeriesByPath(_filePath: string) {
    return undefined
  }

  async refreshSeries(_seriesId: number) {
    return
  }

  async removeQueueItem(id: number, options: { blocklist: boolean; removeFromClient: boolean }) {
    void mockSonarrRemoveQueueItem(id, options)
  }

  async renameSeries(_seriesId: number) {
    return
  }
}
