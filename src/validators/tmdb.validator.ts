import * as v from 'valibot'

import { ISO1 } from '#types/iso_codes'

export const tmdbMovieResponse = v.object({
  original_language: v.picklist(ISO1),
  title: v.string(),
})

export const tmdbTvResponse = v.object({
  name: v.string(),
  original_language: v.picklist(ISO1),
})

export type TmdbMovie = v.InferOutput<typeof tmdbMovieResponse>
export type TmdbTV = v.InferOutput<typeof tmdbTvResponse>

export type TmdbMedia =
  | {
      data: TmdbMovie | undefined
      type: 'movie'
    }
  | {
      data: TmdbTV | undefined
      type: 'tv'
    }
