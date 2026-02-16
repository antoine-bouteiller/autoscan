import { Schema } from 'effect'

import { ISO1 } from '@/types/iso_codes'

export const TmdbMovieResponse = Schema.Struct({
  original_language: Schema.Literal(...ISO1),
  title: Schema.String,
})
export type TmdbMovie = typeof TmdbMovieResponse.Type

export const TmdbTvResponse = Schema.Struct({
  name: Schema.String,
  original_language: Schema.Literal(...ISO1),
})
export type TmdbTV = typeof TmdbTvResponse.Type

export type TmdbMedia = { data: TmdbMovie | undefined; type: 'movie' } | { data: TmdbTV | undefined; type: 'tv' }
