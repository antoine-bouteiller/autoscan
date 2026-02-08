import { afterEach, beforeEach } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { container, TOKENS } from '@/core/container'

import { mockCloudflareClient, mockPlexClient, mockRadarrClient, mockSonarrClient, mockTmdbClient } from './mocks'

import '@/core/bootstrap'

container.register(TOKENS.PLEX_CLIENT, () => mockPlexClient)
container.register(TOKENS.TMDB_CLIENT, () => mockTmdbClient)
container.register(TOKENS.CLOUDFLARE_CLIENT, () => mockCloudflareClient)
container.register(TOKENS.SONARR_CLIENT, () => mockSonarrClient)
container.register(TOKENS.RADARR_CLIENT, () => mockRadarrClient)

interface TestContext {
  testDir: string
}

process.env.NODE_ENV = 'test'

const testContexts = new Map<string, TestContext>()

export const setupTestContext = function setupTestContext(testId: string) {
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
