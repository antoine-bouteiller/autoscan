import { join } from 'node:path'

import * as v from 'valibot'

const numberFromString = v.pipe(
  v.string(),
  v.transform((value) => Number(value)),
  v.check((value) => Number.isFinite(value), 'Expected numeric string')
)

const urlString = v.pipe(
  v.string(),
  v.check((value) => {
    try {
      const url = new URL(value)
      return Boolean(url)
    } catch {
      return false
    }
  }, 'Expected URL')
)

const envSchema = v.object({
  CLOUDFLARE_TOKEN: v.string(),
  DOMAIN: v.string(),
  PLEX_TOKEN: v.string(),
  PLEX_URL: urlString,
  RADARR_API_KEY: v.string(),
  RADARR_API_URL: urlString,
  SONARR_API_KEY: v.string(),
  SONARR_API_URL: urlString,
  TELEGRAM_CHAT_ID: numberFromString,
  TELEGRAM_TOKEN: v.string(),
  TMDB_API_TOKEN: v.string(),
  TMDB_API_URL: urlString,
})

const env = v.parse(envSchema, process.env)

export default {
  ...env,
  DATABASE_URL: process.env['DATABASE_URL'] ?? join(__dirname, '../../resources/autoscan.db'),
}
