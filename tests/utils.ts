import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export { MockPlexClient } from './mocks/plex.mock.ts'
export { MockRadarrClient } from './mocks/radarr.mock.ts'
export { MockSonarrClient } from './mocks/sonarr.mock.ts'
export { MockTelegramClient } from './mocks/telegram.mock.ts'
export { MockTmdbClient } from './mocks/tmdb.mock.ts'
export { MockTraktClient } from './mocks/trakt.mock.ts'

export const videosPath = join(import.meta.dirname, 'resources/videos')

export const makeTestDir = (): string => {
  const dir = join(import.meta.dirname, randomUUID())
  mkdirSync(dir, { recursive: true })
  return dir
}
