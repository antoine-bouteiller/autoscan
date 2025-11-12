import ky from 'ky'

import type { QueueResponse } from '@/types/cleaner'

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
