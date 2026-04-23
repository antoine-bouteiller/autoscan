import { logger } from '#/config/logger'
import { container, TOKENS } from '#/core/container'
import { type QueueService } from '#/integrations/arr/queue.types'

const STRIKE_COUNT = 5

const strikeCounts = new Map<number, number>()

const removeStalledDownloads = async (service: QueueService, serviceName: string): Promise<void> => {
  const queue = await service.getQueue()

  const promises = []
  const currentIds = new Set<number>()

  for (const item of queue?.records ?? []) {
    if (item.title && item.status) {
      const itemId = item.id
      currentIds.add(itemId)
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
        strikeCounts.delete(itemId)
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

  for (const id of strikeCounts.keys()) {
    if (!currentIds.has(id)) {
      strikeCounts.delete(id)
    }
  }
}

export const cleanupAll = async (): Promise<void> => {
  const sonarrClient = container.resolve(TOKENS.SONARR_CLIENT)
  const radarrClient = container.resolve(TOKENS.RADARR_CLIENT)

  await Promise.all([removeStalledDownloads(sonarrClient, 'Sonarr'), removeStalledDownloads(radarrClient, 'Radarr')])
}
