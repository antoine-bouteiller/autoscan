import { logger } from '@/config/logger'
import * as radarrService from '@/integrations/radarr'
import * as sonarrService from '@/integrations/sonarr'
import { tryCatch } from '@/utils/error_handler'

import type { QueueResponse } from './types'

const STRIKE_COUNT = 5

// Initialize the strike count dictionary
const strikeCounts = new Map<number, number>()

interface QueueService {
  getQueue: () => Promise<QueueResponse | undefined>
  removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => Promise<void>
}

export const cleanupAll = async (): Promise<void> => {
  await tryCatch(removeStalledDownloads, sonarrService, 'Sonarr')
  await tryCatch(removeStalledDownloads, radarrService, 'Radarr')
}

const removeStalledDownloads = async (service: QueueService, serviceName: string): Promise<void> => {
  const queue = await service.getQueue()

  const promises = []

  for (const item of queue?.records ?? []) {
    if (item.title && item.status) {
      const itemId = item.id
      const noEligibleFiles = item.statusMessages
        ?.flatMap((message) => message.messages)
        .filter((message) => typeof message === 'string')
        .some(
          (message) =>
            message.includes('No files found are eligible for import') ||
            message.includes('Caution: Found potentially dangerous file with extension:')
        )

      if (item.status === 'warning' && item.errorMessage === 'The download is stalled with no connections') {
        strikeCounts.set(itemId, (strikeCounts.get(itemId) ?? 0) + 1)
        logger.info(`Item ${item.title} has ${strikeCounts.get(itemId)} strikes`, `Cleanup`, serviceName)
      }

      if (noEligibleFiles || (strikeCounts.get(itemId) ?? 0) >= STRIKE_COUNT) {
        logger.info(`Removing download: ${item.title}`, `Cleanup`, serviceName)
        promises.push(
          service.removeQueueItem(itemId, {
            blocklist: true,
            removeFromClient: true,
          })
        )
      }
    } else {
      logger.warn(`Skipping item due to missing or invalid keys: ${JSON.stringify(item)}`, `Cleanup`, serviceName)
    }
  }

  await Promise.all(promises)
}
