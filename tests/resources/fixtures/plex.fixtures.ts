import type { PlexMedia, PlexReponse } from '@/integrations/plex/validators'

export const mockPlexMovie: PlexMedia = {
  key: '/library/metadata/123',
  librarySectionID: 1,
  Media: [
    {
      Part: [
        {
          file: '/path/to/{tmdb-12345}/movie.mkv',
          id: 456,
          Stream: [],
        },
      ],
    },
  ],
  primaryExtraKey: '/library/metadata/123',
  ratingKey: '123',
  title: 'Test Movie',
  type: 'movie',
  year: 2023,
}

export const mockPlexEpisode: PlexMedia = {
  grandparentTitle: 'Test Show',
  key: '/library/metadata/789',
  librarySectionID: 2,
  Media: [
    {
      Part: [
        {
          file: '/path/to/{tmdb-67890}/S01E01.mkv',
          id: 999,
          Stream: [],
        },
      ],
    },
  ],
  parentTitle: 'Season 1',
  primaryExtraKey: '/library/metadata/789',
  ratingKey: '789',
  title: 'Episode 1',
  type: 'episode',
  year: 2023,
}

export const mockPlexMovieResponse: PlexReponse = {
  MediaContainer: {
    Directory: [],
    Metadata: [
      {
        key: '/library/metadata/123',
        librarySectionID: 1,
        Media: [
          {
            Part: [
              {
                file: '/path/to/{tmdb-12345}/movie.mkv',
                id: 456,
                Stream: [],
              },
            ],
          },
        ],
        primaryExtraKey: '/library/metadata/123',
        ratingKey: '123',
        title: 'Test Movie',
        type: 'movie',
        year: 2023,
      },
    ],
  },
}

export const mockPlexEpisodeResponse: PlexReponse = {
  MediaContainer: {
    Directory: [],
    Metadata: [
      {
        grandparentTitle: 'Test Show',
        key: '/library/metadata/789',
        librarySectionID: 2,
        Media: [
          {
            Part: [
              {
                file: '/path/to/{tmdb-67890}/S01E01.mkv',
                id: 999,
                Stream: [],
              },
            ],
          },
        ],
        parentTitle: 'Season 1',
        primaryExtraKey: '/library/metadata/789',
        ratingKey: '789',
        title: 'Episode 1',
        type: 'episode',
        year: 2023,
      },
    ],
  },
}

export const mockPlexSectionsResponse: PlexReponse = {
  MediaContainer: {
    Directory: [
      { key: 1, title: 'Movies', type: 'movie' },
      { key: 2, title: 'TV Shows', type: 'show' },
    ],
    Metadata: [],
  },
}

export const mockPlexMovieMetadata: PlexMedia = {
  key: '/library/metadata/1',
  librarySectionID: 1,
  Media: [],
  primaryExtraKey: '/library/metadata/1',
  ratingKey: '1',
  title: 'Movie 1',
  type: 'movie',
  year: 2023,
}

export const mockPlexEpisodeMetadata: PlexMedia = {
  grandparentTitle: 'Show 2',
  key: '3',
  librarySectionID: 4,
  Media: [],
  primaryExtraKey: '4',
  ratingKey: '2',
  title: 'Show 1',
  type: 'episode',
  year: 2022,
}

export const mockPlexMovieNoFile: PlexMedia = {
  key: '/library/metadata/123',
  librarySectionID: 1,
  Media: [],
  primaryExtraKey: '/library/metadata/123',
  ratingKey: '123',
  title: 'Test Movie',
  type: 'movie',
  year: 2023,
}

export const mockPlexMovieNoTmdbId: PlexMedia = {
  key: '/library/metadata/123',
  librarySectionID: 1,
  Media: [
    {
      Part: [
        {
          file: '/path/to/movie.mkv',
          id: 456,
          Stream: [],
        },
      ],
    },
  ],
  primaryExtraKey: '/library/metadata/123',
  ratingKey: '123',
  title: 'Test Movie',
  type: 'movie',
  year: 2023,
}

export const mockPlexResponseEmpty: PlexReponse = {
  MediaContainer: {
    Directory: [],
    Metadata: [],
  },
}
