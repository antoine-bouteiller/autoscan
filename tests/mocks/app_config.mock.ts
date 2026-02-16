import { Layer, Redacted } from 'effect'

import { AppConfig } from '@/config/app_config'

export const MockAppConfigLayer = Layer.succeed(
  AppConfig,
  AppConfig.make({
    CLOUDFLARE_TOKEN: Redacted.make('test-token'),
    DATABASE_URL: ':memory:',
    DOMAIN: 'example.com',
    NODE_ENV: 'test',
    PLEX_TOKEN: Redacted.make('test-plex-token'),
    PLEX_URL: 'http://plex.test',
    RADARR_API_KEY: Redacted.make('test-radarr-key'),
    RADARR_API_URL: 'http://radarr.test',
    SONARR_API_KEY: Redacted.make('test-sonarr-key'),
    SONARR_API_URL: 'http://sonarr.test',
    TELEGRAM_CHAT_ID: 123_456_789,
    TELEGRAM_TOKEN: Redacted.make('test-telegram-token'),
    TMDB_API_TOKEN: Redacted.make('test-tmdb-token'),
    TMDB_API_URL: 'http://tmdb.test',
  })
)
