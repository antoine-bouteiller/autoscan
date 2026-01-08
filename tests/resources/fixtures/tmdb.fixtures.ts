import type { TmdbMedia } from '@/integrations/tmdb'

export const tmdbTvShowResponse = {
  data: {
    name: 'Test Show From TMDB',
    original_language: 'es',
  },
  type: 'tv',
} satisfies TmdbMedia

export const tmdbMovieResponse = {
  data: {
    original_language: 'es',
    title: 'Test Movie From TMDB',
  },
  type: 'movie',
} satisfies TmdbMedia
