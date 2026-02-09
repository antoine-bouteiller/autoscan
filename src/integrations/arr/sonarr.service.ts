import type { QueueService } from '@/types/cleanup'

import { logError } from '@/utils/error_handler'
import { seriesValidator } from '@/validators/sonarr.validator'

import { ArrClient } from './arr.service'

export interface ISonarrClient extends QueueService {
  refreshSeries(seriesId: number): Promise<void>
  renameSeries(seriesId: number): Promise<void>
  getSeriesByPath(filePath: string): Promise<number | undefined>
}

interface SonarrClientConfig {
  apiKey: string
  apiUrl: string
}

export class SonarrClient extends ArrClient implements ISonarrClient {
  constructor(config: SonarrClientConfig) {
    super({
      baseUrl: `${config.apiUrl}/api/v3`,
      apiKey: config.apiKey,
      serviceName: 'Radarr',
    })
  }

  async refreshSeries(seriesId: number): Promise<void> {
    const result = await this.client.post('command', {
      body: {
        name: 'RefreshSeries',
        seriesId,
      },
    })

    if (!result.ok) {
      logError(result.error)
    }
  }

  async renameSeries(seriesId: number): Promise<void> {
    const result = await this.client.post('command', {
      body: {
        name: 'RenameSeries',
        seriesIds: [seriesId],
      },
    })

    if (!result.ok) {
      logError(result.error)
    }
  }

  async getSeriesByPath(filePath: string): Promise<number | undefined> {
    const result = await this.client.get('series', {
      validator: seriesValidator.array(),
    })

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    const series = result.data.find((s) => filePath.startsWith(s.path))
    return series?.id
  }
}
