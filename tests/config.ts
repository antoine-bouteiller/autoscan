import { afterEach, beforeAll, beforeEach } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { container, TOKENS } from '@/core/container'
import { FfmpegClient } from '@/integrations/ffmpeg.service'

import { MockCloudflareClient } from './mocks/cloudflare.mock'
import { MockPlexClient } from './mocks/plex.mock'
import { MockRadarrClient } from './mocks/radarr.mock'
import { MockSonarrClient } from './mocks/sonarr.mock'
import { MockTmdbClient } from './mocks/tmdb.mock'

export { MockCloudflareClient } from './mocks/cloudflare.mock'
export { MockPlexClient } from './mocks/plex.mock'
export { MockRadarrClient } from './mocks/radarr.mock'
export { MockSonarrClient } from './mocks/sonarr.mock'
export { MockTmdbClient } from './mocks/tmdb.mock'

container.register(TOKENS.PLEX_CLIENT, () => new MockPlexClient())
container.register(TOKENS.TMDB_CLIENT, () => new MockTmdbClient())
container.register(TOKENS.CLOUDFLARE_CLIENT, () => new MockCloudflareClient())
container.register(TOKENS.SONARR_CLIENT, () => new MockSonarrClient())
container.register(TOKENS.RADARR_CLIENT, () => new MockRadarrClient())

interface TestContext {
  testDir: string
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  CLOUDFLARE_TOKEN: 'test-token',
  DATABASE_URL: ':memory:',
  DOMAIN: 'example.com',
  PLEX_TOKEN: 'test-plex-token',
  PLEX_URL: 'http://plex.test',
  RADARR_API_KEY: 'test-radarr-key',
  RADARR_API_URL: 'http://radarr.test',
  SONARR_API_KEY: 'test-sonarr-key',
  SONARR_API_URL: 'http://sonarr.test',
  TELEGRAM_CHAT_ID: '123456789',
  TELEGRAM_TOKEN: 'test-telegram-token',
  TMDB_API_TOKEN: 'test-tmdb-token',
  TMDB_API_URL: 'http://tmdb.test',
})

const testContexts = new Map<string, TestContext>()

export const setupTestContext = function setupTestContext(testId: string) {
  beforeAll(() => {
    container.register(TOKENS.PLEX_CLIENT, () => new MockPlexClient())
    container.register(TOKENS.TMDB_CLIENT, () => new MockTmdbClient())
    container.register(TOKENS.CLOUDFLARE_CLIENT, () => new MockCloudflareClient())
    container.register(TOKENS.SONARR_CLIENT, () => new MockSonarrClient())
    container.register(TOKENS.RADARR_CLIENT, () => new MockRadarrClient())
    container.register(TOKENS.FFMPEG_CLIENT, () => new FfmpegClient())
  })

  beforeEach(() => {
    container.reset()
    const testDir = join(import.meta.dirname, randomUUID())
    mkdirSync(testDir, { recursive: true })
    testContexts.set(testId, { testDir })
  })

  afterEach(() => {
    const context = testContexts.get(testId)
    if (context) {
      rmSync(context.testDir, { recursive: true })
      testContexts.delete(testId)
    }
  })

  return () => {
    const context = testContexts.get(testId)
    if (!context) {
      throw new Error(`Test context not found for test: ${testId}`)
    }
    return context
  }
}

export const videosPath = join(import.meta.dirname, 'resources/videos')
