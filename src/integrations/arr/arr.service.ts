import { queueResponseValidator } from '@/integrations/arr/queue.types'
import { httpClient } from '@/shared/utils/http_client'

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
      headers: { 'X-Api-Key': config.apiKey },
      serviceName: config.serviceName,
    })
  }

  getQueue() {
    return this.client.get('queue', { validator: queueResponseValidator })
  }

  removeQueueItem(itemId: number, options: { blocklist: boolean; removeFromClient: boolean }) {
    return this.client.delete(`queue/${itemId}`, {
      params: { blocklist: options.blocklist, removeFromClient: options.removeFromClient },
    })
  }
}
