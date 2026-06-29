import { inject } from 'vite-plus/test'

Object.assign(process.env, {
  NODE_ENV: 'test',
  PLEX_TOKEN: 'test-plex-token',
  PLEX_URL: 'http://plex.test',
  POSTGRES_DATABASE: inject('POSTGRES_DATABASE'),
  POSTGRES_HOST: inject('POSTGRES_HOST'),
  POSTGRES_PASSWORD: inject('POSTGRES_PASSWORD'),
  POSTGRES_PORT: inject('POSTGRES_PORT'),
  POSTGRES_USERNAME: inject('POSTGRES_USERNAME'),
  RADARR_API_KEY: 'test-radarr-key',
  RADARR_API_URL: 'http://radarr.test',
  SONARR_API_KEY: 'test-sonarr-key',
  SONARR_API_URL: 'http://sonarr.test',
  TELEGRAM_CHAT_ID: '123456789',
  TELEGRAM_TOKEN: 'test-telegram-token',
  TMDB_API_TOKEN: 'test-tmdb-token',
  TMDB_API_URL: 'http://tmdb.test',
  TRAKT_CLIENT_ID: 'test-trakt-id',
  TRAKT_CLIENT_SECRET: 'test-trakt-secret',
  TRANSCODE_PATH: 'resources/transcode',
})
