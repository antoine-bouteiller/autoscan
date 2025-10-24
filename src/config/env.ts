import { join } from 'path'
import { z } from 'zod'

const envSchema = z.object({
  CLOUDFLARE_TOKEN: z.string(),
  DOMAIN: z.string(),
  PLEX_TOKEN: z.string(),
  PLEX_URL: z.string(),
  RADARR_API_KEY: z.string(),
  RADARR_API_URL: z.string(),
  SONARR_API_KEY: z.string(),
  SONARR_API_URL: z.string(),
  TELEGRAM_CHAT_ID: z.coerce.number(),
  TELEGRAM_TOKEN: z.string(),
  TMDB_API_TOKEN: z.string(),
  TMDB_API_URL: z.string(),
})

const env = envSchema.parse(process.env)

export default {
  ...env,
  DATABASE_URL:
    process.env.NODE_ENV === 'development'
      ? ':memory:'
      : join(__dirname, '../../resources/autoscan.db'),
}
