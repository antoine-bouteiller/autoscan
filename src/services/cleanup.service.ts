import { Effect } from 'effect'

import type { QueueResponse } from '@/schemas/queue'

import { RadarrClient } from '@/integrations/arr/radarr.service'
import { SonarrClient } from '@/integrations/arr/sonarr.service'

const STRIKE_COUNT = 5
const strikeCounts = new Map<number, number>()

interface QueueService {
  getQueue: () => Effect.Effect<QueueResponse | undefined>
  removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => Effect.Effect<void>
}

const removeStalledDownloads = Effect.fn('CleanupService.removeStalledDownloads')(function* (service: QueueService, serviceName: string) {
  const queue = yield* service.getQueue()

  const effects: Effect.Effect<void>[] = []

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
        yield* Effect.logInfo(`Item ${item.title} has ${strikeCounts.get(itemId)} strikes`).pipe(
          Effect.annotateLogs({ context: 'Cleanup', service: serviceName })
        )
      }

      if (noEligibleFiles || (strikeCounts.get(itemId) ?? 0) >= STRIKE_COUNT) {
        yield* Effect.logInfo(`Removing download: ${item.title}`).pipe(Effect.annotateLogs({ context: 'Cleanup', service: serviceName }))
        effects.push(
          service.removeQueueItem(itemId, {
            blocklist: true,
            removeFromClient: true,
          })
        )
      }
    } else {
      yield* Effect.logWarning('Skipping item due to missing or invalid keys').pipe(
        Effect.annotateLogs({ item }),
        Effect.annotateLogs({ context: 'Cleanup', service: serviceName })
      )
    }
  }

  yield* Effect.all(effects, { concurrency: 'unbounded' })
})

export class CleanupService extends Effect.Service<CleanupService>()('CleanupService', {
  accessors: true,
  dependencies: [SonarrClient.Default, RadarrClient.Default],
  effect: Effect.gen(function* () {
    const sonarr = yield* SonarrClient
    const radarr = yield* RadarrClient

    const cleanupAll = Effect.fn('CleanupService.cleanupAll')(function* () {
      yield* removeStalledDownloads(sonarr, 'Sonarr')
      yield* removeStalledDownloads(radarr, 'Radarr')
    })

    return {
      cleanupAll,
    }
  }),
}) {}
