import { type } from 'arktype'
import { ISO1 } from '@/types/iso_codes'

export const tmdbMovieResponse = type({
  original_language: type.enumerated(...ISO1),
  title: 'string',
})

export const tmdbTvResponse = type({
  original_language: type.enumerated(...ISO1),
  name: 'string',
})

export type TmdbMovie = typeof tmdbMovieResponse.infer
export type TmdbTV = typeof tmdbTvResponse.infer

export type TmdbMedia =
  | {
      type: 'movie'
      data: TmdbMovie | undefined
    }
  | {
      type: 'tv'
      data: TmdbTV | undefined
    }
