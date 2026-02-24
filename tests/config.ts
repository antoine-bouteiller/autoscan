import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { randomUUIDv7 } from 'bun'
import { it } from 'vitest'

export { MockCloudflareClient } from './mocks/cloudflare.mock'
export { MockPlexClient } from './mocks/plex.mock'
export { MockRadarrClient } from './mocks/radarr.mock'
export { MockSonarrClient } from './mocks/sonarr.mock'
export { MockTmdbClient } from './mocks/tmdb.mock'
export { MockTraktClient } from './mocks/trakt.mock'

export const testWithTestDir = it.extend<{ testDir: string }>({
  testDir: async ({ expect }, use) => {
    const testDir = join(import.meta.dirname, randomUUIDv7())
    mkdirSync(testDir, { recursive: true })
    expect(existsSync(testDir)).toBe(true)
    try {
      await use(testDir)
    } finally {
      rmSync(testDir, { recursive: true })
    }
  },
})
export const videosPath = join(import.meta.dirname, 'resources/videos')
