import { type PlexMedia } from '#integrations/plex/plex.validator'

export const plexMetadata: Record<number, PlexMedia> = {
  123: {
    Media: [
      {
        Part: [
          {
            Stream: [],
            file: '/path/to/{tmdb-12345}/movie.mkv',
            id: 456,
          },
        ],
      },
    ],
    key: '/library/metadata/123',
    librarySectionID: 1,
    primaryExtraKey: '/library/metadata/123',
    ratingKey: '123',
    title: 'Test Movie',
    type: 'movie',
    year: 2023,
  },
  234: {
    Media: [
      {
        Part: [
          {
            Stream: [],
            file: '/path/to/{tmdb-67890}/S01E01.mkv',
            id: 999,
          },
        ],
      },
    ],
    grandparentTitle: 'Test Show',
    key: '/library/metadata/234',
    librarySectionID: 2,
    parentTitle: 'Season 1',
    primaryExtraKey: '/library/metadata/234',
    ratingKey: '234',
    title: 'Episode 1',
    type: 'episode',
    year: 2023,
  },
  345: {
    Media: [],
    key: '/library/metadata/345',
    librarySectionID: 2,
    primaryExtraKey: '/library/metadata/345',
    ratingKey: '345',
    title: 'Test Movie No Media',
    type: 'movie',
    year: 2023,
  },
  567: {
    Media: [
      {
        Part: [
          {
            Stream: [],
            file: '/path/without/tmdb/movie.mkv',
            id: 456,
          },
        ],
      },
    ],
    key: '/library/metadata/567',
    librarySectionID: 2,
    primaryExtraKey: '/library/metadata/567',
    ratingKey: '567',
    title: 'Test No TMDB id',
    type: 'movie',
    year: 2023,
  },
}
