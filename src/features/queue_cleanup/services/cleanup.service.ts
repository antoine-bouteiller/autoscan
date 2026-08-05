import { Effect } from 'effect'

import { logger } from '@/config/logger'
import { Radarr, Sonarr } from '@/core/runtime.service'
import { type QueueResponse, type QueueService } from '@/integrations/arr/queue.types'

const STRIKE_COUNT = 5
type QueueItem = QueueResponse['records'][number]
const strikeCountsByService = new Map<string, Map<number, number>>()

const getStrikeCounts = (serviceName: string): Map<number, number> => {
  const existing = strikeCountsByService.get(serviceName)
  if (existing !== undefined) {
    return existing
  }
  const created = new Map<number, number>()
  strikeCountsByService.set(serviceName, created)
  return created
}

const hasUnimportableFiles = (item: QueueItem): boolean =>
  item.statusMessages
    ?.flatMap((message) => message.messages)
    .filter((message) => typeof message === 'string')
    .some(
      (message) =>
        message.includes('No files found are eligible for import') || message.includes('Caution: Found potentially dangerous file with extension:')
    ) ?? false

const isStalled = (item: QueueItem): boolean => item.status === 'warning' && item.errorMessage === 'The download is stalled with no connections'
const hasNoDownloadSpeed = (item: QueueItem): boolean => item.status === 'downloading' && item.timeleft === undefined

const processItem = (item: QueueItem, serviceName: string): boolean => {
  const strikeCounts = getStrikeCounts(serviceName)
  if (isStalled(item) || hasNoDownloadSpeed(item)) {
    strikeCounts.set(item.id, (strikeCounts.get(item.id) ?? 0) + 1)
    logger.info(`Item ${item.title} has ${strikeCounts.get(item.id)} strikes`, 'Cleanup', serviceName)
  }
  return hasUnimportableFiles(item) || (strikeCounts.get(item.id) ?? 0) >= STRIKE_COUNT
}

const removeStalledDownloads = (service: QueueService, serviceName: string) =>
  Effect.gen(function* () {
    const queue = yield* service.getQueue()
    const strikeCounts = getStrikeCounts(serviceName)
    const currentIds = new Set<number>()
    const removals = []

    for (const item of queue.records) {
      if (!item.title || !item.status) {
        logger.warn(`Skipping item due to missing or invalid keys: ${JSON.stringify(item)}`, 'Cleanup', serviceName)
        continue
      }
      currentIds.add(item.id)
      if (processItem(item, serviceName)) {
        logger.info(`Removing download: ${item.title}`, 'Cleanup', serviceName)
        strikeCounts.delete(item.id)
        removals.push(service.removeQueueItem(item.id, { blocklist: true, removeFromClient: true }))
      }
    }

    yield* Effect.all(removals, { concurrency: 'unbounded', discard: true })
    for (const id of strikeCounts.keys()) {
      if (!currentIds.has(id)) {
        strikeCounts.delete(id)
      }
    }
  })

export const cleanupAll = Effect.gen(function* () {
  const sonarrClient = yield* Sonarr
  const radarrClient = yield* Radarr
  yield* Effect.all([removeStalledDownloads(sonarrClient, 'Sonarr'), removeStalledDownloads(radarrClient, 'Radarr')], {
    concurrency: 'unbounded',
    discard: true,
  })
})
