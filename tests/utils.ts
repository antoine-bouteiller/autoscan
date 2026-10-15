import { Crypto, Effect, FileSystem, Schema } from 'effect'

export { MockBazarrClient } from './mocks/bazarr.mock.ts'
export { checkPinMock, createPinMock, MockPlexClient, refreshSectionsMock, updateStreamMock, verifyTokenMock } from './mocks/plex.mock.ts'
export { MockRadarrClient, mockRadarrQueue, mockRadarrRemoveQueueItem } from './mocks/radarr.mock.ts'
export { MockSonarrClient, mockSonarrQueue, mockSonarrRemoveQueueItem } from './mocks/sonarr.mock.ts'
export { answerCallbackQueryMock, editMessageTextMock, MockTelegramClient, sendMessageMock } from './mocks/telegram.mock.ts'
export { MockTmdbClient } from './mocks/tmdb.mock.ts'

export class TestFailure extends Schema.TaggedError<TestFailure, { readonly brand: unique symbol }>()('TestFailure', { message: Schema.String }) {}

export const videosPath = `${import.meta.dirname}/resources/videos`

export const makeTestDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const crypto = yield* Crypto.Crypto
  const directory = `${import.meta.dirname}/${yield* crypto.randomUUIDv4()}`
  yield* fs.makeDirectory(directory, { recursive: true })
  return directory
})
