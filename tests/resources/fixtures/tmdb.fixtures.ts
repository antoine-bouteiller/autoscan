import type { TmdbMedia } from '@/schemas/tmdb'

export const tmdbTvShowResponse = {
  data: {
    name: 'Test Show From TMDB',
    original_language: 'es',
  },
  type: 'tv',
} satisfies TmdbMedia
