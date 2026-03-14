import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { expect, it } from 'vite-plus/test'

import { container, TOKENS } from '#core/container'
import type { HttpProvider } from '#providers/http_provider'

export { MockCloudflareClient } from './mocks/cloudflare.mock.ts'
export { MockPlexClient } from './mocks/plex.mock.ts'
export { MockRadarrClient } from './mocks/radarr.mock.ts'
export { MockSonarrClient } from './mocks/sonarr.mock.ts'
export { MockTelegramClient } from './mocks/telegram.mock.ts'
export { MockTmdbClient } from './mocks/tmdb.mock.ts'
export { MockTraktClient } from './mocks/trakt.mock.ts'

export const testWithTestDir = it.extend<{ testDir: string }>({
  testDir: async ({}, use) => {
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

export const testWithHttpProvider = it.extend<{ http: HttpProvider }>({
  http: async ({}, use) => {
    await import('#start/routes')
    await use(container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER))
  },
})

export const videosPath = join(import.meta.dirname, 'resources/videos')
