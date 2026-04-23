import { z } from 'zod'

import { ISO1 } from '#/shared/types/iso_codes'

export const tmdbMovieResponse = z.object({
  original_language: z.enum(ISO1),
  title: z.string(),
})

export const tmdbTvResponse = z.object({
  name: z.string(),
  original_language: z.enum(ISO1),
})

export type TmdbMovie = z.infer<typeof tmdbMovieResponse>
export type TmdbTV = z.infer<typeof tmdbTvResponse>

export type TmdbMedia =
  | {
      data: TmdbMovie | undefined
      type: 'movie'
    }
  | {
      data: TmdbTV | undefined
      type: 'tv'
    }
