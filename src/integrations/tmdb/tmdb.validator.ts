import { Schema } from 'effect'

import { TWO_LETTER_LANGUAGE_CODES } from '@/shared/types/iso_codes'

export const tmdbMovieResponse = Schema.Struct({
  original_language: Schema.Literals(TWO_LETTER_LANGUAGE_CODES),
  title: Schema.String,
})

export const tmdbTvResponse = Schema.Struct({
  name: Schema.String,
  original_language: Schema.Literals(TWO_LETTER_LANGUAGE_CODES),
})

export type TmdbMovie = typeof tmdbMovieResponse.Type
export type TmdbTV = typeof tmdbTvResponse.Type

export type TmdbMedia =
  | {
      data: TmdbMovie | undefined
      type: 'movie'
    }
  | {
      data: TmdbTV | undefined
      type: 'tv'
    }
