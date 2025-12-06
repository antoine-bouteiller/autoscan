import ky from 'ky'

import type { QueueResponse } from '@/features/cleanup/types'

import env from '@/config/env'

const sonarrClient = ky.create({
  headers: {
    'X-Api-Key': env.SONARR_API_KEY,
  },
  prefixUrl: `${env.SONARR_API_URL}/api/v3`,
  throwHttpErrors: false,
})

export const getQueue = (): Promise<QueueResponse | undefined> =>
  sonarrClient.get<QueueResponse | undefined>('queue').json()

export const removeQueueItem = async (
  itemId: number,
  options: { blocklist: boolean; removeFromClient: boolean }
): Promise<void> => {
  await sonarrClient.delete(`queue/${itemId}`, {
    searchParams: {
      blocklist: options.blocklist.toString(),
      removeFromClient: options.removeFromClient.toString(),
    },
  })
}

export const refreshSeries = async (seriesId: number): Promise<void> => {
  await sonarrClient.post('command', {
    json: {
      name: 'RefreshSeries',
      seriesId,
    },
  })
}

export const renameSeries = async (seriesId: number): Promise<void> => {
  await sonarrClient.post('command', {
    json: {
      name: 'RenameSeries',
      seriesIds: [seriesId],
    },
  })
}

export const getSeriesByPath = async (filePath: string): Promise<number | undefined> => {
  const response = await sonarrClient.get('series').json<{ id: number; path: string }[]>()
  const series = response.find((s) => filePath.startsWith(s.path))
  return series?.id
}
