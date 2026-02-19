import { join } from 'node:path'

import { type } from 'arktype'

const env = type({
  CLOUDFLARE_TOKEN: 'string',
  DOMAIN: 'string',
  PLEX_TOKEN: 'string',
  PLEX_URL: 'string.url',
  RADARR_API_KEY: 'string',
  RADARR_API_URL: 'string.url',
  SONARR_API_KEY: 'string',
  SONARR_API_URL: 'string.url',
  TELEGRAM_CHAT_ID: 'string.numeric.parse',
  TELEGRAM_TOKEN: 'string',
  TMDB_API_TOKEN: 'string',
  TMDB_API_URL: 'string.url',
}).assert(process.env)

export default {
  ...env,
  DATABASE_URL: process.env['DATABASE_URL'] ?? join(__dirname, '../../resources/autoscan.db'),
}
