import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'bun:test'

// Load test environment variables
process.env['CLOUDFLARE_TOKEN'] = process.env['CLOUDFLARE_TOKEN'] || 'test-cloudflare-token'
process.env['DOMAIN'] = process.env['DOMAIN'] || 'test.example.com'
process.env['PLEX_TOKEN'] = process.env['PLEX_TOKEN'] || 'test-plex-token'
process.env['PLEX_URL'] = process.env['PLEX_URL'] || 'http://localhost:32400'
process.env['RADARR_API_KEY'] = process.env['RADARR_API_KEY'] || 'test-radarr-key'
process.env['RADARR_API_URL'] = process.env['RADARR_API_URL'] || 'http://localhost:7878'
process.env['SONARR_API_KEY'] = process.env['SONARR_API_KEY'] || 'test-sonarr-key'
process.env['SONARR_API_URL'] = process.env['SONARR_API_URL'] || 'http://localhost:8989'
process.env['TELEGRAM_CHAT_ID'] = process.env['TELEGRAM_CHAT_ID'] || '123456789'
process.env['TELEGRAM_TOKEN'] = process.env['TELEGRAM_TOKEN'] || 'test-telegram-token'
process.env['TMDB_API_TOKEN'] = process.env['TMDB_API_TOKEN'] || 'test-tmdb-token'
process.env['TMDB_API_URL'] = process.env['TMDB_API_URL'] || 'https://api.themoviedb.org/3'

interface TestContext {
  testDir: string
}

const testContexts = new Map<string, TestContext>()

export const setupTestContext = function setupTestContext(testId: string) {
  beforeEach(() => {
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

export const videosPath = join(import.meta.dirname, 'videos')
