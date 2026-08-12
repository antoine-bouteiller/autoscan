import { beforeEach, describe, expect, test } from 'bun:test'

import { runTest } from '@tests/effect'
import {
  mockQueueResponseEmpty,
  mockQueueResponseNormal,
  mockQueueResponseWithDangerousFiles,
  mockQueueResponseWithNoEligibleFiles,
  mockQueueResponseWithStalledWarning,
} from '@tests/resources/fixtures/queue.fixtures'
import {
  MockRadarrClient,
  MockSonarrClient,
  mockRadarrQueue,
  mockRadarrRemoveQueueItem,
  mockSonarrQueue,
  mockSonarrRemoveQueueItem,
} from '@tests/utils'
import { Effect } from 'effect'

import { cleanupAll } from '@/features/queue_cleanup/services/cleanup.service'
import { type IRadarrClient } from '@/integrations/arr/radarr.service'
import { NetworkError } from '@/shared/errors/network'

const removalQueue = (firstId: number) => ({
  records: Array.from({ length: 8 }, (_item, index) => ({
    id: firstId + index,
    status: 'warning',
    statusMessages: [{ messages: ['No files found are eligible for import'], title: 'Import' }],
    title: `Remove ${index}`,
  })),
  totalRecords: 8,
})

describe('cleanupAll', () => {
  beforeEach(() => {
    mockRadarrQueue.mockReset().mockResolvedValue(mockQueueResponseEmpty)
    mockSonarrQueue.mockReset().mockResolvedValue(mockQueueResponseEmpty)
    mockRadarrRemoveQueueItem.mockReset().mockResolvedValue(undefined)
    mockSonarrRemoveQueueItem.mockReset().mockResolvedValue(undefined)
  })

  test('removes downloads with no eligible files', async () => {
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithNoEligibleFiles)
    await runTest(cleanupAll)
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledWith(1, { blocklist: true, removeFromClient: true })
  })

  test('removes dangerous downloads', async () => {
    mockSonarrQueue.mockResolvedValue(mockQueueResponseWithDangerousFiles)
    await runTest(cleanupAll)
    expect(mockSonarrRemoveQueueItem).toHaveBeenCalledWith(2, { blocklist: true, removeFromClient: true })
  })

  test('does not remove a first stalled strike', async () => {
    mockRadarrQueue.mockResolvedValue(mockQueueResponseWithStalledWarning)
    await runTest(cleanupAll)
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('handles empty and normal queues', async () => {
    mockRadarrQueue.mockResolvedValue(mockQueueResponseNormal)
    expect(await runTest(cleanupAll)).toBeUndefined()
    expect(mockRadarrRemoveQueueItem).not.toHaveBeenCalled()
  })

  test('retains strikes for a stalled item from the end of a complete queue', async () => {
    const normalItems = Array.from({ length: 100 }, (_item, index) => ({
      id: 10_000 + index,
      status: 'downloading',
      timeleft: '00:10:00',
      title: `Normal ${index}`,
    }))
    mockRadarrQueue.mockResolvedValue({
      records: [...normalItems, { errorMessage: 'The download is stalled with no connections', id: 9001, status: 'warning', title: 'Later page' }],
      totalRecords: 101,
    })

    for (let strike = 1; strike <= 5; strike += 1) {
      await runTest(cleanupAll)
    }

    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledTimes(1)
    expect(mockRadarrRemoveQueueItem).toHaveBeenCalledWith(9001, { blocklist: true, removeFromClient: true })
  })

  test('runs at most four queue removals concurrently and attempts every eligible item', async () => {
    let active = 0
    let attempts = 0
    let maximum = 0
    let blocked = true
    const { promise: started, resolve: signalStarted } = Promise.withResolvers<void>()
    const releases: (() => void)[] = []
    const remove = () =>
      Effect.promise(() => {
        attempts += 1
        active += 1
        maximum = Math.max(maximum, active)
        if (active === 4) {
          signalStarted()
        }
        if (!blocked) {
          active -= 1
          return Promise.resolve()
        }
        return new Promise<void>((resolve) => {
          releases.push(() => {
            active -= 1
            resolve()
          })
        })
      })
    class InstrumentedRadarrClient extends MockRadarrClient {
      override getQueue() {
        return Effect.succeed(removalQueue(20_000))
      }

      override removeQueueItem() {
        return remove()
      }
    }
    class InstrumentedSonarrClient extends MockSonarrClient {
      override getQueue() {
        return Effect.succeed(removalQueue(40_000))
      }

      override removeQueueItem() {
        return remove()
      }
    }

    const cleanup = runTest(cleanupAll, { radarr: new InstrumentedRadarrClient(), sonarr: new InstrumentedSonarrClient() })
    await started
    const activeBeforeRelease = active
    blocked = false
    for (const release of releases) {
      release()
    }
    await cleanup

    expect(activeBeforeRelease).toBe(4)

    expect(maximum).toBe(4)
    expect(attempts).toBe(16)
  })

  test('fails fast without retrying or erasing the failed item strike', async () => {
    let attempts = 0
    let fails = true
    const stalled = {
      errorMessage: 'The download is stalled with no connections',
      id: 30_000,
      status: 'warning',
      title: 'Failed removal',
    }
    const radarr: IRadarrClient = {
      // oxlint-disable-next-line effecttsgo/effect-succeed-with-void -- success channel is number | undefined, not void
      getMovieByPath: () => Effect.succeed(undefined),
      getQueue: () => Effect.succeed({ records: [stalled], totalRecords: 1 }),
      refreshMovie: () => Effect.void,
      removeQueueItem: () => {
        attempts += 1
        return fails ? Effect.fail(new NetworkError({ originalMessage: 'failed', serviceName: 'Radarr' })) : Effect.void
      },
      renameMovie: () => Effect.void,
    }

    for (let strike = 1; strike < 5; strike += 1) {
      await runTest(cleanupAll, { radarr })
    }
    const failure = await runTest(cleanupAll, { radarr }).then(
      () => undefined,
      (error: unknown) => error
    )
    fails = false
    await runTest(cleanupAll, { radarr })

    expect(failure).toBeInstanceOf(NetworkError)
    expect(attempts).toBe(2)
  })
})
