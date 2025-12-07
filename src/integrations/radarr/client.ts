import env from '@/config/env'
import { type QueueResponse, queueResponseValidator } from '@/features/cleanup'
import { httpClient } from '@/utils/http_client'

import { movieValidator } from './validators'

const radarrClient = httpClient({
  baseUrl: `${env.RADARR_API_URL}/api/v3`,
  headers: {
    'X-Api-Key': env.RADARR_API_KEY,
  },
})

export const getQueue = async (): Promise<QueueResponse | undefined> => {
  try {
    return await radarrClient.get('queue', {
      validator: queueResponseValidator,
    })
  } catch {
    return undefined
  }
}

export const removeQueueItem = async (
  itemId: number,
  options: { blocklist: boolean; removeFromClient: boolean }
): Promise<void> => {
  await radarrClient.delete(`queue/${itemId}`, {
    params: {
      blocklist: options.blocklist,
      removeFromClient: options.removeFromClient,
    },
  })
}

export const refreshMovie = async (movieId: number): Promise<void> => {
  await radarrClient.post('command', {
    body: {
      movieId,
      name: 'RefreshMovie',
    },
  })
}

export const renameMovie = async (movieId: number): Promise<void> => {
  await radarrClient.post('command', {
    body: {
      files: [],
      movieId,
      name: 'RenameMovie',
    },
  })
}

export const getMovieByPath = async (filePath: string): Promise<number | undefined> => {
  try {
    const movies = await radarrClient.get('movie', {
      validator: movieValidator.array(),
    })
    const movie = movies.find((m) => filePath.startsWith(m.path))
    return movie?.id
  } catch {
    return undefined
  }
}
