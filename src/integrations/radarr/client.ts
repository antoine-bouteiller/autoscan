import env from '@/config/env'
import { IntegrationError } from '@/errors'
import { type QueueResponse, queueResponseValidator } from '@/features/cleanup'
import { handleError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import { movieValidator } from './validators'

const radarrClient = httpClient({
  baseUrl: `${env.RADARR_API_URL}/api/v3`,
  headers: {
    'X-Api-Key': env.RADARR_API_KEY,
  },
})

export const getQueue = async (): Promise<QueueResponse | undefined> => {
  const result = await radarrClient.get('queue', {
    validator: queueResponseValidator,
  })

  if (!result.ok) {
    handleError(new IntegrationError('Radarr', 'http_error', result.error))
    return undefined
  }

  return result.data
}

export const removeQueueItem = async (
  itemId: number,
  options: { blocklist: boolean; removeFromClient: boolean }
): Promise<void> => {
  const result = await radarrClient.delete(`queue/${itemId}`, {
    params: {
      blocklist: options.blocklist,
      removeFromClient: options.removeFromClient,
    },
  })

  if (!result.ok) {
    handleError(new IntegrationError('Radarr', 'http_error', result.error))
  }
}

export const refreshMovie = async (movieId: number): Promise<void> => {
  const result = await radarrClient.post('command', {
    body: {
      movieId,
      name: 'RefreshMovie',
    },
  })

  if (!result.ok) {
    handleError(new IntegrationError('Radarr', 'http_error', result.error))
  }
}

export const renameMovie = async (movieId: number): Promise<void> => {
  const result = await radarrClient.post('command', {
    body: {
      files: [],
      movieId,
      name: 'RenameMovie',
    },
  })

  if (!result.ok) {
    handleError(new IntegrationError('Radarr', 'http_error', result.error))
  }
}

export const getMovieByPath = async (filePath: string): Promise<number | undefined> => {
  const result = await radarrClient.get('movie', {
    validator: movieValidator.array(),
  })

  if (!result.ok) {
    handleError(new IntegrationError('Radarr', 'http_error', result.error))
    return undefined
  }

  const movie = result.data.find((m) => filePath.startsWith(m.path))
  return movie?.id
}
