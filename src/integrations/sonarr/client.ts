import { type QueueResponse, queueResponseValidator } from '@/features/cleanup/types'
import { logError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import { seriesValidator } from './validators'

interface SonarrClientConfig {
  apiKey: string
  apiUrl: string
}

export class SonarrClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor(config: SonarrClientConfig) {
    this.client = httpClient({
      baseUrl: `${config.apiUrl}/api/v3`,
      headers: {
        'X-Api-Key': config.apiKey,
      },
      serviceName: 'Sonarr',
    })
  }

  async getQueue(): Promise<QueueResponse | undefined> {
    const result = await this.client.get('queue', {
      validator: queueResponseValidator,
    })

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    return result.data
  }

  async removeQueueItem(itemId: number, options: { blocklist: boolean; removeFromClient: boolean }): Promise<void> {
    const result = await this.client.delete(`queue/${itemId}`, {
      params: {
        blocklist: options.blocklist,
        removeFromClient: options.removeFromClient,
      },
    })

    if (!result.ok) {
      logError(result.error)
    }
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
