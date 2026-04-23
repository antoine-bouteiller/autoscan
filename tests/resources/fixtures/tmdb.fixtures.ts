import { type TmdbMedia } from '#/integrations/tmdb/tmdb.validator'

export const tmdbTvShowResponse = {
  data: {
    name: 'Test Show From TMDB',
    original_language: 'es',
  },
  type: 'tv',
} satisfies TmdbMedia
