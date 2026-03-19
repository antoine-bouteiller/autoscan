import { z } from 'zod'

import type { QueueService } from '#types/cleanup'
import { isError, logError } from '#utils/error'
import { movieValidator } from '#validators/radarr.validator'

import { ArrClient } from './arr.service.js'

export interface IRadarrClient extends QueueService {
  refreshMovie(movieId: number): Promise<void>
  renameMovie(movieId: number): Promise<void>
  getMovieByPath(filePath: string): Promise<number | undefined>
}

interface RadarrClientConfig {
  apiKey: string
  apiUrl: string
}

export class RadarrClient extends ArrClient implements IRadarrClient {
  constructor(config: RadarrClientConfig) {
    super({
      baseUrl: `${config.apiUrl}/api/v3`,
      apiKey: config.apiKey,
      serviceName: 'Radarr',
    })
  }

  async refreshMovie(movieId: number): Promise<void> {
    const result = await this.client.post('command', {
      body: {
        movieId,
        name: 'RefreshMovie',
      },
    })

    if (isError(result)) {
      logError(result)
    }
  }

  async renameMovie(movieId: number): Promise<void> {
    const result = await this.client.post('command', {
      body: {
        files: [],
        movieId,
        name: 'RenameMovie',
      },
    })

    if (isError(result)) {
      logError(result)
    }
  }

  async getMovieByPath(filePath: string): Promise<number | undefined> {
    const result = await this.client.get('movie', {
      validator: z.array(movieValidator),
    })

    if (isError(result)) {
      logError(result)
      return undefined
    }

    const movie = result.find((m) => filePath.startsWith(m.path))
    return movie?.id
  }
}
