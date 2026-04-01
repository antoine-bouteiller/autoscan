import { readFileSync } from 'node:fs'

import { z } from 'zod'

for (const key of [
  'CLOUDFLARE_TOKEN',
  'PLEX_TOKEN',
  'RADARR_API_KEY',
  'SONARR_API_KEY',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_TOKEN',
  'TMDB_API_TOKEN',
  'TRAKT_CLIENT_ID',
  'TRAKT_CLIENT_SECRET',
]) {
  const filePath = process.env[`${key}_FILE`]
  if (filePath) {
    process.env[key] = readFileSync(filePath, 'utf8').trim()
  }
}

const urlString = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return Boolean(url)
  } catch {
    return false
  }
}, 'Expected URL')

const envSchema = z.object({
  CLOUDFLARE_TOKEN: z.string(),
  DATABASE_URL: z.string(),
  DOMAIN: z.string(),
  PLEX_TOKEN: z.string(),
  PLEX_URL: urlString,
  RADARR_API_KEY: z.string(),
  RADARR_API_URL: urlString,
  SONARR_API_KEY: z.string(),
  SONARR_API_URL: urlString,
  TELEGRAM_CHAT_ID: z.coerce.number(),
  TELEGRAM_TOKEN: z.string(),
  TMDB_API_TOKEN: z.string(),
  TMDB_API_URL: urlString,
  TRAKT_CLIENT_ID: z.string(),
  TRAKT_CLIENT_SECRET: z.string(),
  TRANSCODE_PATH: z.string(),
})

const env = envSchema.parse(process.env)

export default env
