import { z } from 'zod'

import { type QueueService } from '#/integrations/arr/queue.types'
import { seriesValidator } from '#/integrations/arr/sonarr.validator'
import { isError, logError } from '#/shared/utils/error'

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
      apiKey: config.apiKey,
      baseUrl: `${config.apiUrl}/api/v3`,
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

    const series = result.find((item) => filePath.startsWith(item.path))
    return series?.id
  }
}
