import { z } from 'zod'

import type { QueueService } from '#types/cleanup'
import { isError, logError } from '#utils/error'
import { seriesValidator } from '#validators/sonarr.validator'

import { ArrClient } from './arr.service.js'

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

    if (isError(result)) {
      logError(result)
    }
  }

  async renameSeries(seriesId: number): Promise<void> {
    const result = await this.client.post('command', {
      body: {
        name: 'RenameSeries',
        seriesIds: [seriesId],
      },
    })

    if (isError(result)) {
      logError(result)
    }
  }

  async getSeriesByPath(filePath: string): Promise<number | undefined> {
    const result = await this.client.get('series', {
      validator: z.array(seriesValidator),
    })

    if (isError(result)) {
      logError(result)
      return undefined
    }

    const series = result.find((s) => filePath.startsWith(s.path))
    return series?.id
  }
}
