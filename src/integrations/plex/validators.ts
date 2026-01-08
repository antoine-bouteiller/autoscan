import { type } from 'arktype'

import { ISO2T } from '@/types/iso_codes'

const streamValidator = type({
  id: 'number',
  'languageCode?': type.enumerated(...ISO2T),
  selected: 'boolean = false',
  streamType: '1 | 2 | 3',
  'title?': 'string',
})

export const plexMediaValidator = type({
  'grandparentTitle?': 'string',
  key: 'string',
  'librarySectionID?': 'number',
  Media: type({
    Part: type({
      file: 'string',
      id: 'number',
      'Stream?': streamValidator.array(),
    }).array(),
  }).array(),
  'parentTitle?': 'string',
  'primaryExtraKey?': 'string',
  ratingKey: 'string',
  title: 'string',
  type: "'episode' | 'movie'",
  year: 'number',
})

export const plexDirectoryValidator = type({
  key: 'string.integer.parse',
  title: 'string',
  type: "'movie' | 'show'",
})

export const plexResponseValidator = type({
  MediaContainer: type({
    'Directory?': plexDirectoryValidator.array(),
    'Metadata?': plexMediaValidator.array(),
  }),
})

export type PlexMediaStream = typeof streamValidator.infer
export type PlexMedia = typeof plexMediaValidator.infer
export type PlexReponse = typeof plexResponseValidator.infer
