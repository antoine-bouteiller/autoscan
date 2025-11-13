import ky from 'ky'

import type { QueueResponse } from '@/types/cleaner'

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
