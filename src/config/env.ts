import { readFileSync } from 'node:fs'

import * as v from 'valibot'

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
  TRAKT_CLIENT_ID: v.string(),
  TRAKT_CLIENT_SECRET: v.string(),
  DATABASE_URL: v.string(),
  TRANSCODE_PATH: v.string(),
})

const env = v.parse(envSchema, process.env)

export default env
