import type { TmdbMedia } from '@/integrations/tmdb'

export const tmdbTvShowResponse = {
  type: 'tv',
  data: {
    original_language: 'es',
    name: 'Test Show From TMDB',
  },
} satisfies TmdbMedia

export const tmdbMovieResponse = {
  type: 'movie',
  data: {
    original_language: 'es',
    title: 'Test Movie From TMDB',
  },
} satisfies TmdbMedia
