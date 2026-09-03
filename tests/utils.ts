import { Crypto, Data, Effect, FileSystem } from 'effect'

export { checkPinMock, createPinMock, MockPlexClient, refreshSectionsMock, updateStreamMock, verifyTokenMock } from './mocks/plex.mock.ts'
export { MockRadarrClient, mockRadarrQueue, mockRadarrRemoveQueueItem } from './mocks/radarr.mock.ts'
export { MockSonarrClient, mockSonarrQueue, mockSonarrRemoveQueueItem } from './mocks/sonarr.mock.ts'
export { answerCallbackQueryMock, editMessageTextMock, MockTelegramClient, sendMessageMock } from './mocks/telegram.mock.ts'
export { MockTmdbClient } from './mocks/tmdb.mock.ts'
export { getDeviceCodeMock, MockTraktClient, refreshTokenMock, syncWatchedHistoryMock } from './mocks/trakt.mock.ts'

export class TestFailure extends Data.TaggedError('TestFailure')<{ readonly message: string }> {}

export const videosPath = `${import.meta.dirname}/resources/videos`

export const makeTestDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const crypto = yield* Crypto.Crypto
  const directory = `${import.meta.dirname}/${yield* crypto.randomUUIDv4}`
  yield* fs.makeDirectory(directory, { recursive: true })
  return directory
})
