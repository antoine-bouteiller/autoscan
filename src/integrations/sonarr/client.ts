import env from '@/config/env'
import { type QueueResponse, queueResponseValidator } from '@/features/cleanup'
import { httpClient } from '@/utils/http_client'

import { seriesValidator } from './validators'

const sonarrClient = httpClient({
  baseUrl: `${env.SONARR_API_URL}/api/v3`,
  headers: {
    'X-Api-Key': env.SONARR_API_KEY,
  },
})

export const getQueue = async (): Promise<QueueResponse | undefined> => {
  try {
    return await sonarrClient.get('queue', {
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
  await sonarrClient.delete(`queue/${itemId}`, {
    params: {
      blocklist: options.blocklist,
      removeFromClient: options.removeFromClient,
    },
  })
}

export const refreshSeries = async (seriesId: number): Promise<void> => {
  await sonarrClient.post('command', {
    body: {
      name: 'RefreshSeries',
      seriesId,
    },
  })
}

export const renameSeries = async (seriesId: number): Promise<void> => {
  await sonarrClient.post('command', {
    body: {
      name: 'RenameSeries',
      seriesIds: [seriesId],
    },
  })
}

export const getSeriesByPath = async (filePath: string): Promise<number | undefined> => {
  try {
    const series = await sonarrClient.get('series', {
      validator: seriesValidator.array(),
    })
    const result = series.find((s) => filePath.startsWith(s.path))
    return result?.id
  } catch {
    return undefined
  }
}
