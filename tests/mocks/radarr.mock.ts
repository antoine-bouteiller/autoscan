import { Effect, Layer } from 'effect'
import { vi } from 'vitest'

import { RadarrClient } from '@/integrations/arr/radarr.service'

export const mockRadarrQueue = vi.fn<InstanceType<typeof RadarrClient>['getQueue']>(() => Effect.succeed(undefined))
export const mockRadarrRemoveQueueItem = vi.fn<InstanceType<typeof RadarrClient>['removeQueueItem']>(() => Effect.void)

export const MockRadarrLayer = Layer.succeed(
  RadarrClient,
  RadarrClient.make({
    getQueue: () => mockRadarrQueue(),
    removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => mockRadarrRemoveQueueItem(id, options),
    getMovieByPath: () => Effect.succeed(undefined),
    refreshMovie: () => Effect.void,
    renameMovie: () => Effect.void,
  })
)
