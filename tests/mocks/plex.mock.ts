import { vi } from 'vite-plus/test'

import { PlexError } from '#errors/plex'
import type { IPlexClient } from '#integrations/plex.service'
import type { PlexMedia } from '#validators/plex.validator'

import { plexMetadata } from '../resources/fixtures/plex.fixtures.js'

export const updateStreamMock = vi.fn()
export const refreshSectionMock = vi.fn()

const movies = [
  {
    key: 'movie-1-key',
    title: 'Movie 1',
    year: 2023,
    ratingKey: 'movie-1',
    type: 'movie',
    viewCount: 1,
    lastViewedAt: 1_700_000_000,
    Media: [{ Part: [{ file: '/path/to/Movie (2023) {tmdb-123}.mkv', id: 1 }] }],
  },
  {
    key: 'already-synced-key',
    title: 'Already Synced',
    year: 2023,
    ratingKey: 'already-synced',
    type: 'movie',
    viewCount: 1,
    Media: [{ Part: [{ file: '/path/to/Synced (2023) {tmdb-456}.mkv', id: 2 }] }],
  },
  {
    key: 'not-watched-key',
    title: 'Not Watched',
    year: 2023,
    ratingKey: 'not-watched',
    type: 'movie',
    viewCount: 0,
    Media: [{ Part: [{ file: '/path/to/Unwatched (2023) {tmdb-789}.mkv', id: 3 }] }],
  },
] satisfies PlexMedia[]

const episodes = [
  {
    key: 'ep-1-key',
    title: 'Episode 1',
    year: 2023,
    ratingKey: 'ep-1',
    type: 'episode',
    viewCount: 1,
    parentIndex: 1,
    index: 5,
    lastViewedAt: 1_700_000_001,
    Media: [{ Part: [{ file: '/path/to/Show S01E05 {tmdb-999}.mkv', id: 4 }] }],
  },
] satisfies PlexMedia[]

export class MockPlexClient implements IPlexClient {
  async getPlexMetadata(ratingKey: number) {
    return plexMetadata[ratingKey] ?? new PlexError({ ratingKey })
  }

  getBasicMediaInfo(plexMedia: PlexMedia) {
    const part = plexMedia.Media?.[0]?.Part?.[0]
    return {
      file: part?.file,
      ratingKey: plexMedia.ratingKey,
      type: plexMedia.type === 'episode' ? ('show' as const) : plexMedia.type,
    }
  }

  async getSectionMedia(id: number) {
    if (id === 1) {
      return movies
    }

    if (id == 2) {
      return episodes
    }

    return []
  }

  async getSections() {
    return [
      { key: 1, title: 'Movies', type: 'movie' as const },
      { key: 2, title: 'TV', type: 'show' as const },
    ]
  }

  refreshSection = refreshSectionMock

  async updateStream(partsId: number, streamId: number, type: 'audio' | 'subtitle') {
    updateStreamMock(partsId, streamId, type)
  }
}
