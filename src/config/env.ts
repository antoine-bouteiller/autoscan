import { join } from 'path'
import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PLEX_TOKEN: z.string(),
  PLEX_URL: z.string(),

  TELEGRAM_CHAT_ID: z.coerce.number(),
  TELEGRAM_TOKEN: z.string(),

  TMDB_API_TOKEN: z.string(),
  TMDB_API_URL: z.string(),

  RADARR_API_KEY: z.string(),
  RADARR_API_URL: z.string(),

  SONARR_API_KEY: z.string(),
  SONARR_API_URL: z.string(),

  CLOUDFLARE_TOKEN: z.string(),

  DOMAIN: z.string(),
})

const env = envSchema.parse(process.env)

export default {
  ...env,
  DATABASE_URL: join(__dirname, '../../resources/autoscan.db'),
}
