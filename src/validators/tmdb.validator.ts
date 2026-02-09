import { type } from 'arktype'

import { ISO1 } from '@/types/iso_codes'

export const tmdbMovieResponse = type({
  original_language: type.enumerated(...ISO1),
  title: 'string',
})

export const tmdbTvResponse = type({
  name: 'string',
  original_language: type.enumerated(...ISO1),
})

export type TmdbMovie = typeof tmdbMovieResponse.infer
export type TmdbTV = typeof tmdbTvResponse.infer

export type TmdbMedia =
  | {
      data: TmdbMovie | undefined
      type: 'movie'
    }
  | {
      data: TmdbTV | undefined
      type: 'tv'
    }
