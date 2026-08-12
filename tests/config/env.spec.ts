import { afterEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Result, Schema } from 'effect'

import env, { loadFileSecrets, urlString } from '@/config/env'

const writeTempSecret = (value: string): string => {
  const filePath = join(tmpdir(), `autoscan-test-${randomUUID()}.txt`)
  writeFileSync(filePath, value)
  return filePath
}

describe('env', () => {
  test('should expose required keys from process.env', () => {
    expect(process.env['PLEX_TOKEN']).toBe(env.PLEX_TOKEN)
    expect(process.env['TRANSCODE_PATH']).toBe(env.TRANSCODE_PATH)
  })

  test('should coerce TELEGRAM_CHAT_ID to a number', () => {
    expect(typeof env.TELEGRAM_CHAT_ID).toBe('number')
    expect(env.TELEGRAM_CHAT_ID).toBe(Number(process.env['TELEGRAM_CHAT_ID']))
  })
})

describe('loadFileSecrets', () => {
  const tempFiles: string[] = []

  afterEach(() => {
    for (const file of tempFiles) {
      if (existsSync(file)) {
        unlinkSync(file)
      }
    }
    tempFiles.length = 0
  })

  test('should load secret from _FILE path and trim whitespace', () => {
    const filePath = writeTempSecret('  my-secret\n')
    tempFiles.push(filePath)
    const target: Record<string, string | undefined> = { PLEX_TOKEN_FILE: filePath }

    loadFileSecrets(target)

    expect(target['PLEX_TOKEN']).toBe('my-secret')
  })

  test('should leave target unchanged when no _FILE var is set', () => {
    const target: Record<string, string | undefined> = { PLEX_TOKEN: 'existing' }

    loadFileSecrets(target)

    expect(target['PLEX_TOKEN']).toBe('existing')
  })

  test('should leave target unchanged when _FILE points to missing path', () => {
    const target: Record<string, string | undefined> = {
      PLEX_TOKEN: 'existing',
      PLEX_TOKEN_FILE: '/nonexistent/path',
    }

    loadFileSecrets(target)

    expect(target['PLEX_TOKEN']).toBe('existing')
  })

  test('should load multiple secrets from different _FILE paths', () => {
    const plexFile = writeTempSecret('plex-secret')
    const tmdbFile = writeTempSecret('tmdb-secret')
    tempFiles.push(plexFile, tmdbFile)
    const target: Record<string, string | undefined> = {
      PLEX_TOKEN_FILE: plexFile,
      TMDB_API_TOKEN_FILE: tmdbFile,
    }

    loadFileSecrets(target)

    expect(target['PLEX_TOKEN']).toBe('plex-secret')
    expect(target['TMDB_API_TOKEN']).toBe('tmdb-secret')
  })
})

describe('urlString', () => {
  test('should accept valid http URLs', () => {
    expect(Result.isSuccess(Schema.decodeResult(urlString)('http://example.com'))).toBe(true)
  })

  test('should accept valid https URLs', () => {
    expect(Result.isSuccess(Schema.decodeResult(urlString)('https://example.com/path?q=1'))).toBe(true)
  })

  test('should reject empty strings', () => {
    expect(Result.isFailure(Schema.decodeResult(urlString)(''))).toBe(true)
  })

  test('should reject non-URL strings', () => {
    const result = Schema.decodeResult(urlString)('not a url at all')
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.message).toBe('Expected URL')
    }
  })
})
