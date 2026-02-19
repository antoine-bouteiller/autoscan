import { container, TOKENS } from '@/core/container'
import { FfmpegClient } from '@/integrations/ffmpeg.service'

import { MockCloudflareClient, MockPlexClient, MockRadarrClient, MockSonarrClient, MockTmdbClient } from './config'

Object.assign(process.env, {
  NODE_ENV: 'test',
  CLOUDFLARE_TOKEN: 'test-token',
  DATABASE_URL: ':memory:',
  DOMAIN: 'example.com',
  PLEX_TOKEN: 'test-plex-token',
  PLEX_URL: 'http://plex.test',
  RADARR_API_KEY: 'test-radarr-key',
  RADARR_API_URL: 'http://radarr.test',
  SONARR_API_KEY: 'test-sonarr-key',
  SONARR_API_URL: 'http://sonarr.test',
  TELEGRAM_CHAT_ID: '123456789',
  TELEGRAM_TOKEN: 'test-telegram-token',
  TMDB_API_TOKEN: 'test-tmdb-token',
  TMDB_API_URL: 'http://tmdb.test',
})

container.register(TOKENS.PLEX_CLIENT, () => new MockPlexClient())
container.register(TOKENS.TMDB_CLIENT, () => new MockTmdbClient())
container.register(TOKENS.CLOUDFLARE_CLIENT, () => new MockCloudflareClient())
container.register(TOKENS.SONARR_CLIENT, () => new MockSonarrClient())
container.register(TOKENS.RADARR_CLIENT, () => new MockRadarrClient())
container.register(TOKENS.FFMPEG_CLIENT, () => new FfmpegClient())
