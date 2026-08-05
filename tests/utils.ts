import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export { MockPlexClient, refreshSectionsMock, updateStreamMock } from './mocks/plex.mock.ts'
export { MockRadarrClient, mockRadarrQueue, mockRadarrRemoveQueueItem } from './mocks/radarr.mock.ts'
export { MockSonarrClient, mockSonarrQueue, mockSonarrRemoveQueueItem } from './mocks/sonarr.mock.ts'
export { answerCallbackQueryMock, editMessageTextMock, MockTelegramClient, sendMessageMock } from './mocks/telegram.mock.ts'
export { MockTmdbClient } from './mocks/tmdb.mock.ts'
export { getDeviceCodeMock, MockTraktClient, refreshTokenMock, syncWatchedHistoryMock } from './mocks/trakt.mock.ts'

export const videosPath = join(import.meta.dirname, 'resources/videos')

export const makeTestDir = (): string => {
  const directory = join(import.meta.dirname, randomUUID())
  mkdirSync(directory, { recursive: true })
  return directory
}
