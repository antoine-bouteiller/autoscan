import { Effect, FileSystem, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'

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
  const secureRandom = yield* SecureRandom.SecureRandom
  const directory = `${import.meta.dirname}/${yield* secureRandom.uuidV4()}`
  yield* fs.makeDirectory(directory, { recursive: true })
  return directory
}).pipe(Effect.provide(SecureRandom.layerWebCrypto))
