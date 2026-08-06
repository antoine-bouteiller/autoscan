import { Effect, Schema } from 'effect'

import { ArrClient } from '@/integrations/arr/arr.service'
import { type QueueService } from '@/integrations/arr/queue.types'
import { movieValidator } from '@/integrations/arr/radarr.validator'
import { type HttpClientError } from '@/shared/types/http_client'

export interface IRadarrClient extends QueueService {
  readonly getMovieByPath: (filePath: string) => Effect.Effect<number | undefined, HttpClientError>
  readonly refreshMovie: (movieId: number) => Effect.Effect<void, HttpClientError>
  readonly renameMovie: (movieId: number) => Effect.Effect<void, HttpClientError>
}

interface RadarrClientConfig {
  apiKey: string
  apiUrl: string
}

export class RadarrClient extends ArrClient implements IRadarrClient {
  constructor(config: RadarrClientConfig) {
    super({ apiKey: config.apiKey, baseUrl: `${config.apiUrl}/api/v3`, serviceName: 'Radarr' })
  }

  refreshMovie(movieId: number) {
    return this.client.post('command', { body: { movieId, name: 'RefreshMovie' } })
  }

  renameMovie(movieId: number) {
    return this.client.post('command', { body: { files: [], movieId, name: 'RenameMovie' } })
  }

  getMovieByPath(filePath: string) {
    return this.client
      .get('movie', { validator: Schema.Array(movieValidator).pipe(Schema.mutable) })
      .pipe(Effect.map((movies) => movies.find((movie) => filePath.startsWith(movie.path))?.id))
  }
}
