// oxlint-disable no-empty-pattern
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { expect, it } from 'vite-plus/test'

export { MockCloudflareClient } from './mocks/cloudflare.mock.ts'
export { MockPlexClient } from './mocks/plex.mock.ts'
export { MockRadarrClient } from './mocks/radarr.mock.ts'
export { MockSonarrClient } from './mocks/sonarr.mock.ts'
export { MockTelegramClient } from './mocks/telegram.mock.ts'
export { MockTmdbClient } from './mocks/tmdb.mock.ts'
export { MockTraktClient } from './mocks/trakt.mock.ts'

// oxlint-disable-next-line no-empty-pattern
export const testWithTestDir = it.extend('testDir', async ({}, { onCleanup }) => {
  const testDir = join(import.meta.dirname, randomUUID())
  mkdirSync(testDir, { recursive: true })
  expect(existsSync(testDir)).toBe(true)

  onCleanup(() => {
    rmSync(testDir, { recursive: true })
  })

  return testDir
})

export const videosPath = join(import.meta.dirname, 'resources/videos')
