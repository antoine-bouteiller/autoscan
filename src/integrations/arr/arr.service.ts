import { queueResponseValidator, type QueueResponse } from '#types/cleanup'
import { isError, logError } from '#utils/error'
import { httpClient } from '#utils/http_client'

interface ArrClientConfig {
  apiKey: string
  baseUrl: string
  serviceName: string
}

export class ArrClient {
  readonly client: ReturnType<typeof httpClient>

  constructor(config: ArrClientConfig) {
    this.client = httpClient({
      baseUrl: config.baseUrl,
      headers: {
        'X-Api-Key': config.apiKey,
      },
      serviceName: config.serviceName,
    })
  }

  async getQueue(): Promise<QueueResponse | undefined> {
    const result = await this.client.get('queue', {
      validator: queueResponseValidator,
    })

    if (isError(result)) {
      logError(result)
      return undefined
    }

    return result
  }

  async removeQueueItem(itemId: number, options: { blocklist: boolean; removeFromClient: boolean }): Promise<void> {
    const result = await this.client.delete(`queue/${itemId}`, {
      params: {
        blocklist: options.blocklist,
        removeFromClient: options.removeFromClient,
      },
    })

    if (isError(result)) {
      logError(result)
    }
  }
}
