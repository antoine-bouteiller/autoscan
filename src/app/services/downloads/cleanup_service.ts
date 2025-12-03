import type { QueueResponse } from '@/types/cleaner'

import { tryCatch } from '@/app/exceptions/handler'
import * as radarrService from '@/app/integrations/arr/radarr_client'
import * as sonarrService from '@/app/integrations/arr/sonarr_client'
import { logger } from '@/config/logger'

const STRIKE_COUNT = 5

// Initialize the strike count dictionary
const strikeCounts = new Map<number, number>()

interface QueueService {
  getQueue: () => Promise<QueueResponse | undefined>
  removeQueueItem: (
    id: number,
    options: { blocklist: boolean; removeFromClient: boolean }
  ) => Promise<void>
}

export const cleanupAll = async (): Promise<void> => {
  await tryCatch(removeStalledDownloads, sonarrService, 'Sonarr')
  await tryCatch(removeStalledDownloads, radarrService, 'Radarr')
}

const removeStalledDownloads = async (
  service: QueueService,
  serviceName: string
): Promise<void> => {
  const queue = await service.getQueue()

  const promises = []

  for (const item of queue?.records ?? []) {
    if (item.title && item.status) {
      const itemId = item.id
      const noEligibleFiles = item.statusMessages
        ?.flatMap((message) => message.messages)
        .some(
          (message) =>
            message.includes('No files found are eligible for import') ||
            message.includes('Caution: Found potentially dangerous file with extension:')
        )

      if (
        item.status === 'warning' &&
        item.errorMessage === 'The download is stalled with no connections'
      ) {
        strikeCounts.set(itemId, (strikeCounts.get(itemId) ?? 0) + 1)
        logger.info(`Item ${item.title} has ${strikeCounts.get(itemId)} strikes`)
      }

      if (noEligibleFiles || (strikeCounts.get(itemId) ?? 0) >= STRIKE_COUNT) {
        logger.info(`Removing ${serviceName} download: ${item.title}`)
        promises.push(
          service.removeQueueItem(itemId, {
            blocklist: true,
            removeFromClient: true,
          })
        )
      }
    } else {
      logger.warn(
        `Skipping item in ${serviceName} queue due to missing or invalid keys: ${JSON.stringify(item)}`
      )
    }
  }

  await Promise.all(promises)
}
