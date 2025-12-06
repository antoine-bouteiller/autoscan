import arkenv from 'arkenv'
import { join } from 'node:path'

const env = arkenv({
  CLOUDFLARE_TOKEN: 'string',
  DOMAIN: 'string',
  PLEX_TOKEN: 'string',
  PLEX_URL: 'string',
  RADARR_API_KEY: 'string',
  RADARR_API_URL: 'string',
  SONARR_API_KEY: 'string',
  SONARR_API_URL: 'string',
  TELEGRAM_CHAT_ID: 'string.numeric.parse',
  TELEGRAM_TOKEN: 'string',
  TMDB_API_TOKEN: 'string',
  TMDB_API_URL: 'string',
})

export default {
  ...env,
  DATABASE_URL: join(__dirname, '../../resources/autoscan.db'),
}
