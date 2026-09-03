import { jest } from 'bun:test'

import { plexMetadata } from '@tests/resources/fixtures/plex.fixtures'
import { Effect } from 'effect'

import { PlexError } from '@/integrations/plex/plex.errors'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type PlexMedia, type PlexPin } from '@/integrations/plex/plex.validator'
import { NetworkError } from '@/shared/errors/network'

export const updateStreamMock = jest.fn().mockResolvedValue(undefined)
const refreshSectionMock = jest.fn().mockResolvedValue(undefined)
export const refreshSectionsMock = jest.fn().mockResolvedValue(undefined)
export const createPinMock = jest.fn<(clientIdentifier: string) => Promise<PlexPin>>().mockResolvedValue({ code: 'PIN1', expiresIn: 900, id: 42 })
export const checkPinMock = jest.fn<(id: number, clientIdentifier: string) => Promise<string | undefined>>().mockResolvedValue(undefined)
export const verifyTokenMock = jest.fn<(token: string, clientIdentifier: string) => Promise<boolean>>().mockResolvedValue(true)

const fromPromise = <Value>(run: () => Promise<Value>) =>
  Effect.tryPromise({ catch: (cause) => new NetworkError({ cause, originalMessage: String(cause), serviceName: 'PlexTest' }), try: run })

const movies = [
  {
    Media: [{ Part: [{ file: '/path/to/Movie (2023) {tmdb-123}.mkv', id: 1 }] }],
    key: 'movie-1-key',
    lastViewedAt: 1_700_000_000,
    ratingKey: 'movie-1',
    title: 'Movie 1',
    type: 'movie',
    viewCount: 1,
  },
  {
    Media: [{ Part: [{ file: '/path/to/Synced (2023) {tmdb-456}.mkv', id: 2 }] }],
    key: 'already-synced-key',
    ratingKey: 'already-synced',
    title: 'Already Synced',
    type: 'movie',
    viewCount: 1,
  },
  {
    Media: [{ Part: [{ file: '/path/to/Unwatched (2023) {tmdb-789}.mkv', id: 3 }] }],
    key: 'not-watched-key',
    ratingKey: 'not-watched',
    title: 'Not Watched',
    type: 'movie',
    viewCount: 0,
  },
] satisfies PlexMedia[]

const episodes = [
  {
    Media: [{ Part: [{ file: '/path/to/Show S01E05 {tmdb-999}.mkv', id: 4 }] }],
    index: 5,
    key: 'ep-1-key',
    lastViewedAt: 1_700_000_001,
    parentIndex: 1,
    ratingKey: 'ep-1',
    title: 'Episode 1',
    type: 'episode',
    viewCount: 1,
  },
] satisfies PlexMedia[]

export class MockPlexClient implements IPlexClient {
  getPlexMetadata(ratingKey: number) {
    const media = plexMetadata[ratingKey]
    return media === undefined ? Effect.fail(new PlexError({ ratingKey })) : Effect.succeed(media)
  }

  getBasicMediaInfo(plexMedia: PlexMedia) {
    const part = plexMedia.Media[0]?.Part[0]
    return { file: part?.file, ratingKey: plexMedia.ratingKey, type: plexMedia.type === 'episode' ? 'show' : plexMedia.type }
  }

  getSectionMedia(id: number) {
    if (id === 1) {
      return Effect.succeed(movies)
    }
    return Effect.succeed(id === 2 ? episodes : [])
  }

  get getSections() {
    return Effect.succeed([
      { key: 1, title: 'Movies', type: 'movie' as const },
      { key: 2, title: 'TV', type: 'show' as const },
    ])
  }

  refreshSection(id: number, filePath: string) {
    return Effect.promise(() => refreshSectionMock(id, filePath))
  }

  refreshSections(filePath: string, mediaType: 'movie' | 'show') {
    return Effect.promise(() => refreshSectionsMock(filePath, mediaType))
  }

  updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle') {
    return Effect.promise(() => updateStreamMock(partsId, streamId, type))
  }

  createPin(clientIdentifier: string) {
    return fromPromise(() => createPinMock(clientIdentifier))
  }

  checkPin(id: number, clientIdentifier: string) {
    return fromPromise(() => checkPinMock(id, clientIdentifier))
  }

  verifyToken(token: string, clientIdentifier: string) {
    return fromPromise(() => verifyTokenMock(token, clientIdentifier))
  }
}
