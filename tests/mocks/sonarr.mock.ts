import { vi } from 'vitest'

import type { ISonarrClient } from '@/integrations/arr/sonarr.service'

export const mockSonarrQueue = vi.fn<ISonarrClient['getQueue']>()
export const mockSonarrRemoveQueueItem = vi.fn<ISonarrClient['removeQueueItem']>()

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
