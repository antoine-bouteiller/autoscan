import { Effect } from 'effect'
import { z } from 'zod'

import { ArrClient } from '@/integrations/arr/arr.service'
import { type QueueService } from '@/integrations/arr/queue.types'
import { seriesValidator } from '@/integrations/arr/sonarr.validator'
import { type HttpClientError } from '@/shared/types/http_client'

export interface ISonarrClient extends QueueService {
  readonly getSeriesByPath: (filePath: string) => Effect.Effect<number | undefined, HttpClientError>
  readonly refreshSeries: (seriesId: number) => Effect.Effect<void, HttpClientError>
  readonly renameSeries: (seriesId: number) => Effect.Effect<void, HttpClientError>
}

interface SonarrClientConfig {
  apiKey: string
  apiUrl: string
}

export class SonarrClient extends ArrClient implements ISonarrClient {
  constructor(config: SonarrClientConfig) {
    super({ apiKey: config.apiKey, baseUrl: `${config.apiUrl}/api/v3`, serviceName: 'Sonarr' })
  }

  refreshSeries(seriesId: number) {
    return this.client.post('command', { body: { name: 'RefreshSeries', seriesId } })
  }

  renameSeries(seriesId: number) {
    return this.client.post('command', { body: { name: 'RenameSeries', seriesIds: [seriesId] } })
  }

  getSeriesByPath(filePath: string) {
    return this.client
      .get('series', { validator: z.array(seriesValidator) })
      .pipe(Effect.map((series) => series.find((item) => filePath.startsWith(item.path))?.id))
  }
}
