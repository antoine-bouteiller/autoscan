import { Effect, Formatter, Semaphore } from 'effect'

import { Radarr, Sonarr } from '@/core/runtime.service'
import { type QueueResponse, type QueueService } from '@/integrations/arr/queue.types'

const STRIKE_COUNT = 5
const REMOVAL_CONCURRENCY = 4
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

const processItem = (item: QueueItem, serviceName: string) => {
  const strikeCounts = getStrikeCounts(serviceName)
  let strikes: number | undefined
  if (isStalled(item) || hasNoDownloadSpeed(item)) {
    strikes = (strikeCounts.get(item.id) ?? 0) + 1
    strikeCounts.set(item.id, strikes)
  }
  return { remove: hasUnimportableFiles(item) || (strikeCounts.get(item.id) ?? 0) >= STRIKE_COUNT, strikes }
}

const removeStalledDownloads = (service: QueueService, serviceName: string, removalPermits: Semaphore.Semaphore) =>
  Effect.gen(function* () {
    const queue = yield* service.getQueue
    const strikeCounts = getStrikeCounts(serviceName)
    const currentIds = new Set<number>()
    const removals = []
    const context = ['Cleanup', serviceName]

    for (const item of queue.records) {
      if (item.title === '' || item.status === '') {
        yield* Effect.logWarning(`Skipping item due to missing or invalid keys: ${Formatter.format(item)}`).pipe(
          Effect.annotateLogs('context', context)
        )
        continue
      }
      currentIds.add(item.id)
      const result = processItem(item, serviceName)
      if (result.strikes !== undefined) {
        yield* Effect.logInfo(`Item ${item.title} has ${result.strikes} strikes`).pipe(Effect.annotateLogs('context', context))
      }
      if (result.remove) {
        const removal = Effect.logInfo(`Removing download: ${item.title}`).pipe(
          Effect.annotateLogs('context', context),
          Effect.andThen(service.removeQueueItem(item.id, { blocklist: true, removeFromClient: true })),
          Effect.tap(() => Effect.sync(() => strikeCounts.delete(item.id)))
        )
        removals.push(removalPermits.withPermits(1)(removal))
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
  const removalPermits = yield* Semaphore.make(REMOVAL_CONCURRENCY)
  yield* Effect.all(
    [removeStalledDownloads(sonarrClient, 'Sonarr', removalPermits), removeStalledDownloads(radarrClient, 'Radarr', removalPermits)],
    { concurrency: 'unbounded', discard: true }
  )
})
