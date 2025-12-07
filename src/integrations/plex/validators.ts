import { type } from 'arktype'

export const plexMediaStreamValidator = type({
  id: 'number',
  languageCode: 'string',
  selected: 'boolean',
  streamType: 'number',
  'title?': 'string',
})

export const plexMediaValidator = type({
  'grandparentTitle?': 'string',
  key: 'string',
  librarySectionID: 'number',
  Media: type({
    Part: type({
      file: 'string',
      id: 'number',
      Stream: plexMediaStreamValidator.array(),
    }).array(),
  }).array(),
  'parentTitle?': 'string',
  primaryExtraKey: 'string',
  ratingKey: 'string',
  title: 'string',
  type: "'episode' | 'movie'",
  year: 'number',
})

export const plexDirectoryValidator = type({
  key: 'number',
  title: 'string',
  type: "'movie' | 'show'",
})

export const plexResponseValidator = type({
  MediaContainer: type({
    'Directory?': plexDirectoryValidator.array(),
    'Metadata?': plexMediaValidator.array(),
  }),
})

export type PlexMediaStream = typeof plexMediaStreamValidator.infer
export type PlexMedia = typeof plexMediaValidator.infer
export type PlexReponse = typeof plexResponseValidator.infer
