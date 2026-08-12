import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { it } from '@tests/it'
import { makeTestDir } from '@tests/utils'
import { Effect, FileSystem, Path } from 'effect'

import {
  areSubtitlesOutOfSync,
  countLines,
  findLangSrt,
  formatReport,
  parseStartTimestamps,
  parseTimestampMs,
} from '@/features/transcoding/commands/subtitle_scan.command'

const SRT_BLOCK_IN_SYNC = '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nWorld'
const SRT_BLOCK_OFFSET_500MS = '1\n00:00:01,500 --> 00:00:03,500\nBonjour\n\n2\n00:00:05,500 --> 00:00:07,500\nMonde'
const SRT_BLOCK_OFFSET_100MS = '1\n00:00:01,100 --> 00:00:03,000\nBonjour\n\n2\n00:00:05,100 --> 00:00:07,000\nMonde'

const run = <Success, Error>(effect: Effect.Effect<Success, Error, BunServices.BunServices>) =>
  Effect.runPromise(Effect.provide(effect, BunServices.layer))

let testDir: string

beforeEach(() =>
  run(
    Effect.tap(makeTestDir, (directory) =>
      Effect.sync(() => {
        testDir = directory
      })
    )
  )
)

afterEach(() => run(Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.ignore(fs.remove(testDir, { recursive: true })))))

describe('parseTimestampMs', () => {
  test('should convert "00:00:00,000" to 0', () => {
    expect(parseTimestampMs('00:00:00,000')).toBe(0)
  })

  test('should convert "00:00:01,500" to 1500', () => {
    expect(parseTimestampMs('00:00:01,500')).toBe(1500)
  })

  test('should handle hours, minutes, seconds, and ms', () => {
    expect(parseTimestampMs('01:02:03,004')).toBe(3_600_000 + 120_000 + 3000 + 4)
  })
})

describe('findLangSrt', () => {
  it.live('should return the srt path when it exists', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const mediaFile = path.join(testDir, 'movie.mkv')
      const srtFile = path.join(testDir, 'movie.en.srt')
      yield* fs.writeFileString(mediaFile, '')
      yield* fs.writeFileString(srtFile, 'content')

      expect(yield* findLangSrt(mediaFile, 'en')).toBe(srtFile)
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return undefined when the srt is missing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const mediaFile = path.join(testDir, 'movie.mkv')
      yield* fs.writeFileString(mediaFile, '')

      expect(yield* findLangSrt(mediaFile, 'en')).toBeUndefined()
    }).pipe(Effect.provide(BunServices.layer))
  )
})

describe('countLines', () => {
  it.live('should count blocks separated by blank lines', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const srtFile = path.join(testDir, 'count.srt')
      yield* fs.writeFileString(srtFile, SRT_BLOCK_IN_SYNC)

      expect(yield* countLines(srtFile)).toBe(2)
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return 0 for a missing file', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      expect(yield* countLines(path.join(testDir, 'does-not-exist.srt'))).toBe(0)
    }).pipe(Effect.provide(BunServices.layer))
  )
})

describe('parseStartTimestamps', () => {
  it.live('should extract start timestamps in order', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const srtFile = path.join(testDir, 'stamps.srt')
      yield* fs.writeFileString(srtFile, SRT_BLOCK_IN_SYNC)

      expect(yield* parseStartTimestamps(srtFile)).toEqual([1000, 5000])
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return empty array for a missing file', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      expect(yield* parseStartTimestamps(path.join(testDir, 'missing.srt'))).toEqual([])
    }).pipe(Effect.provide(BunServices.layer))
  )
})

describe('areSubtitlesOutOfSync', () => {
  const writePair = (contentA: string, contentB: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const pathA = path.join(testDir, 'a.srt')
      const pathB = path.join(testDir, 'b.srt')
      yield* fs.writeFileString(pathA, contentA)
      yield* fs.writeFileString(pathB, contentB)
      return { pathA, pathB }
    })

  it.live('should return false for identical timestamps', () =>
    Effect.gen(function* () {
      const { pathA, pathB } = yield* writePair(SRT_BLOCK_IN_SYNC, SRT_BLOCK_IN_SYNC)
      expect(yield* areSubtitlesOutOfSync(pathA, pathB)).toBe(false)
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return true when majority of timestamps are > 300ms apart', () =>
    Effect.gen(function* () {
      const { pathA, pathB } = yield* writePair(SRT_BLOCK_IN_SYNC, SRT_BLOCK_OFFSET_500MS)
      expect(yield* areSubtitlesOutOfSync(pathA, pathB)).toBe(true)
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return false when offset is within 300ms threshold', () =>
    Effect.gen(function* () {
      const { pathA, pathB } = yield* writePair(SRT_BLOCK_IN_SYNC, SRT_BLOCK_OFFSET_100MS)
      expect(yield* areSubtitlesOutOfSync(pathA, pathB)).toBe(false)
    }).pipe(Effect.provide(BunServices.layer))
  )

  it.live('should return false when either file is empty / missing timestamps', () =>
    Effect.gen(function* () {
      const { pathA, pathB } = yield* writePair('', SRT_BLOCK_IN_SYNC)
      expect(yield* areSubtitlesOutOfSync(pathA, pathB)).toBe(false)
    }).pipe(Effect.provide(BunServices.layer))
  )
})

describe('formatReport', () => {
  test('should return empty string when both lists are empty', () => {
    expect(formatReport([], [])).toBe('')
  })

  test('should format missing subtitles with count and bullets', () => {
    const report = formatReport(['Movie A', 'Movie B'], [])
    expect(report).toContain('2 media without matching subtitles')
    expect(report).toContain('• Movie A')
    expect(report).toContain('• Movie B')
  })

  test('should format out-of-sync subtitles with count and bullets', () => {
    const report = formatReport([], ['Movie C'])
    expect(report).toContain('1 media with out-of-sync subtitles')
    expect(report).toContain('• Movie C')
  })

  test('should render both sections separated by a blank line when both are non-empty', () => {
    const report = formatReport(['Missing One'], ['OutOfSync One'])
    expect(report).toContain('1 media without matching subtitles')
    expect(report).toContain('1 media with out-of-sync subtitles')
    expect(report.split('\n\n').length).toBeGreaterThanOrEqual(3)
  })
})
