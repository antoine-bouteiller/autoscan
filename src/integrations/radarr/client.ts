import env from '@/config/env'
import { type QueueResponse, queueResponseValidator } from '@/features/cleanup'
import { handleHttpError } from '@/utils/error_handler'
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
    handleHttpError(result.error, 'Radarr')
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
    handleHttpError(result.error, 'Radarr')
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
    handleHttpError(result.error, 'Radarr')
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
    handleHttpError(result.error, 'Radarr')
  }
}

export const getMovieByPath = async (filePath: string): Promise<number | undefined> => {
  const result = await radarrClient.get('movie', {
    validator: movieValidator.array(),
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Radarr')
    return undefined
  }

  const movie = result.data.find((m) => filePath.startsWith(m.path))
  return movie?.id
}
