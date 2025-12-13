import env from '@/config/env'
import { type QueueResponse, queueResponseValidator } from '@/features/cleanup'
import { handleHttpError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import { seriesValidator } from './validators'

const sonarrClient = httpClient({
  baseUrl: `${env.SONARR_API_URL}/api/v3`,
  headers: {
    'X-Api-Key': env.SONARR_API_KEY,
  },
})

export const getQueue = async (): Promise<QueueResponse | undefined> => {
  const result = await sonarrClient.get('queue', {
    validator: queueResponseValidator,
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Sonarr')
    return undefined
  }

  return result.data
}

export const removeQueueItem = async (
  itemId: number,
  options: { blocklist: boolean; removeFromClient: boolean }
): Promise<void> => {
  const result = await sonarrClient.delete(`queue/${itemId}`, {
    params: {
      blocklist: options.blocklist,
      removeFromClient: options.removeFromClient,
    },
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Sonarr')
  }
}

export const refreshSeries = async (seriesId: number): Promise<void> => {
  const result = await sonarrClient.post('command', {
    body: {
      name: 'RefreshSeries',
      seriesId,
    },
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Sonarr')
  }
}

export const renameSeries = async (seriesId: number): Promise<void> => {
  const result = await sonarrClient.post('command', {
    body: {
      name: 'RenameSeries',
      seriesIds: [seriesId],
    },
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Sonarr')
  }
}

export const getSeriesByPath = async (filePath: string): Promise<number | undefined> => {
  const result = await sonarrClient.get('series', {
    validator: seriesValidator.array(),
  })

  if (!result.ok) {
    handleHttpError(result.error, 'Sonarr')
    return undefined
  }

  const series = result.data.find((s) => filePath.startsWith(s.path))
  return series?.id
}
