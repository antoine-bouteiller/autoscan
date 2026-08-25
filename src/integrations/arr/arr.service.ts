import { Effect } from 'effect'
import { type HttpClient as EffectHttpClient } from 'effect/unstable/http'

import { type QueueResponse, queueResponseValidator } from '@/integrations/arr/queue.types'
import { httpClient } from '@/shared/utils/http_client'

const PAGE_SIZE = 100

interface ArrClientConfig {
  apiKey: string
  baseUrl: string
  serviceName: string
  transport: EffectHttpClient.HttpClient
}

export class ArrClient {
  readonly client: ReturnType<typeof httpClient>

  constructor(config: ArrClientConfig) {
    this.client = httpClient({
      baseUrl: config.baseUrl,
      headers: { 'X-Api-Key': config.apiKey },
      serviceName: config.serviceName,
      transport: config.transport,
    })
  }

  get getQueue() {
    const { client } = this
    return Effect.gen(function* () {
      const records: QueueResponse['records'][number][] = []
      let page = 1
      let totalRecords = 0

      while (true) {
        const response = yield* client.get('queue', {
          params: { page, pageSize: PAGE_SIZE },
          validator: queueResponseValidator,
        })
        const { records: pageRecords, totalRecords: reportedTotal } = response
        totalRecords = reportedTotal
        records.push(...pageRecords)
        if (pageRecords.length === 0 || records.length >= totalRecords) {
          return { records, totalRecords }
        }
        page += 1
      }
    })
  }

  removeQueueItem(itemId: number, options: { blocklist: boolean; removeFromClient: boolean }) {
    return this.client.delete(`queue/${itemId}`, {
      params: { blocklist: options.blocklist, removeFromClient: options.removeFromClient },
    })
  }
}
