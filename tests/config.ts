import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { it } from '@effect/vitest'

export { MockAppConfigLayer } from './mocks/app_config.mock'
export { MockCloudflareLayer, mockGetARecord, mockGetZoneId, mockUpdateDnsRecord } from './mocks/cloudflare.mock'
export { MockPlexLayer, updateStreamMock } from './mocks/plex.mock'
export { MockRadarrLayer, mockRadarrQueue, mockRadarrRemoveQueueItem } from './mocks/radarr.mock'
export { MockSonarrLayer, mockSonarrQueue, mockSonarrRemoveQueueItem } from './mocks/sonarr.mock'
export { MockTmdbLayer } from './mocks/tmdb.mock'

export const videosPath = join(import.meta.dirname, 'resources/videos')

export const testWithTestDir = it.extend<{ testDir: string }>({
  testDir: async ({ expect }, use) => {
    const testDir = join(import.meta.dirname, randomUUID())
    mkdirSync(testDir, { recursive: true })
    expect(existsSync(testDir)).toBe(true)
    try {
      await use(testDir)
    } finally {
      rmSync(testDir, { recursive: true })
    }
  },
})
