import { type QueueResponse, queueResponseValidator } from '@/types/cleanup'
import { logError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'
import { movieValidator } from '@/validators/radarr.validator'

interface RadarrClientConfig {
  apiKey: string
  apiUrl: string
}

export class RadarrClient {
  private readonly client: ReturnType<typeof httpClient>

  constructor(config: RadarrClientConfig) {
    this.client = httpClient({
      baseUrl: `${config.apiUrl}/api/v3`,
      headers: {
        'X-Api-Key': config.apiKey,
      },
      serviceName: 'Radarr',
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

  async refreshMovie(movieId: number): Promise<void> {
    const result = await this.client.post('command', {
      body: {
        movieId,
        name: 'RefreshMovie',
      },
    })

    if (!result.ok) {
      logError(result.error)
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

    if (!result.ok) {
      logError(result.error)
    }
  }

  async getMovieByPath(filePath: string): Promise<number | undefined> {
    const result = await this.client.get('movie', {
      validator: movieValidator.array(),
    })

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    const movie = result.data.find((m) => filePath.startsWith(m.path))
    return movie?.id
  }
}
