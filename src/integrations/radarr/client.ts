import ky from 'ky'

import type { QueueResponse } from '@/features/cleanup/types'

import env from '@/config/env'

const radarrClient = ky.create({
  headers: {
    'X-Api-Key': env.RADARR_API_KEY,
  },
  prefixUrl: `${env.RADARR_API_URL}/api/v3`,
  throwHttpErrors: false,
})

export const getQueue = (): Promise<QueueResponse | undefined> =>
  radarrClient.get<QueueResponse | undefined>('queue').json()

export const removeQueueItem = async (
  itemId: number,
  options: { blocklist: boolean; removeFromClient: boolean }
): Promise<void> => {
  await radarrClient.delete(`queue/${itemId}`, {
    searchParams: {
      blocklist: options.blocklist.toString(),
      removeFromClient: options.removeFromClient.toString(),
    },
  })
}

export const refreshMovie = async (movieId: number): Promise<void> => {
  await radarrClient.post('command', {
    json: {
      movieId,
      name: 'RefreshMovie',
    },
  })
}

export const renameMovie = async (movieId: number): Promise<void> => {
  await radarrClient.post('command', {
    json: {
      files: [],
      movieId,
      name: 'RenameMovie',
    },
  })
}

export const getMovieByPath = async (filePath: string): Promise<number | undefined> => {
  const response = await radarrClient.get('movie').json<{ id: number; path: string }[]>()
  const movie = response.find((m) => filePath.startsWith(m.path))
  return movie?.id
}
