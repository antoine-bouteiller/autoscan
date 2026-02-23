import { vi } from 'vitest'

import type { ISonarrClient } from '@/integrations/arr/sonarr.service'

export const mockSonarrQueue = vi.fn<ISonarrClient['getQueue']>()
export const mockSonarrRemoveQueueItem = vi.fn<ISonarrClient['removeQueueItem']>()

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
