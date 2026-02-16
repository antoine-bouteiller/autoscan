import { Effect, Layer } from 'effect'
import { vi } from 'vitest'

import { SonarrClient } from '@/integrations/arr/sonarr.service'

export const mockSonarrQueue = vi.fn<InstanceType<typeof SonarrClient>['getQueue']>(() => Effect.succeed(undefined))
export const mockSonarrRemoveQueueItem = vi.fn<InstanceType<typeof SonarrClient>['removeQueueItem']>(() => Effect.void)

export const MockSonarrLayer = Layer.succeed(
  SonarrClient,
  SonarrClient.make({
    getQueue: () => mockSonarrQueue(),
    removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => mockSonarrRemoveQueueItem(id, options),
    getSeriesByPath: () => Effect.succeed(undefined),
    refreshSeries: () => Effect.void,
    renameSeries: () => Effect.void,
  })
)
