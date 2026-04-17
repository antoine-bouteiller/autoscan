import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vite-plus/test'

import {
  areSubtitlesOutOfSync,
  countLines,
  findLangSrt,
  formatReport,
  parseStartTimestamps,
  parseTimestampMs,
} from '#features/transcoding/commands/subtitle_scan.command'

import { testWithTestDir } from '../../../utils.ts'

const SRT_BLOCK_IN_SYNC = '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nWorld'
const SRT_BLOCK_OFFSET_500MS = '1\n00:00:01,500 --> 00:00:03,500\nBonjour\n\n2\n00:00:05,500 --> 00:00:07,500\nMonde'
const SRT_BLOCK_OFFSET_100MS = '1\n00:00:01,100 --> 00:00:03,000\nBonjour\n\n2\n00:00:05,100 --> 00:00:07,000\nMonde'

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
  testWithTestDir('should return the srt path when it exists', ({ testDir }) => {
    const mediaFile = join(testDir, 'movie.mkv')
    const srtFile = join(testDir, 'movie.en.srt')
    writeFileSync(mediaFile, '')
    writeFileSync(srtFile, 'content')

    expect(findLangSrt(mediaFile, 'en')).toBe(srtFile)
  })

  testWithTestDir('should return undefined when the srt is missing', ({ testDir }) => {
    const mediaFile = join(testDir, 'movie.mkv')
    writeFileSync(mediaFile, '')

    expect(findLangSrt(mediaFile, 'en')).toBeUndefined()
  })
})

describe('countLines', () => {
  testWithTestDir('should count blocks separated by blank lines', ({ testDir }) => {
    const srtFile = join(testDir, 'count.srt')
    writeFileSync(srtFile, SRT_BLOCK_IN_SYNC)

    expect(countLines(srtFile)).toBe(2)
  })

  testWithTestDir('should return 0 for a missing file', ({ testDir }) => {
    expect(countLines(join(testDir, 'does-not-exist.srt'))).toBe(0)
  })
})

describe('parseStartTimestamps', () => {
  testWithTestDir('should extract start timestamps in order', ({ testDir }) => {
    const srtFile = join(testDir, 'stamps.srt')
    writeFileSync(srtFile, SRT_BLOCK_IN_SYNC)

    expect(parseStartTimestamps(srtFile)).toEqual([1000, 5000])
  })

  testWithTestDir('should return empty array for a missing file', ({ testDir }) => {
    expect(parseStartTimestamps(join(testDir, 'missing.srt'))).toEqual([])
  })
})

describe('areSubtitlesOutOfSync', () => {
  testWithTestDir('should return false for identical timestamps', ({ testDir }) => {
    const pathA = join(testDir, 'a.srt')
    const pathB = join(testDir, 'b.srt')
    writeFileSync(pathA, SRT_BLOCK_IN_SYNC)
    writeFileSync(pathB, SRT_BLOCK_IN_SYNC)

    expect(areSubtitlesOutOfSync(pathA, pathB)).toBe(false)
  })

  testWithTestDir('should return true when majority of timestamps are > 300ms apart', ({ testDir }) => {
    const pathA = join(testDir, 'a.srt')
    const pathB = join(testDir, 'b.srt')
    writeFileSync(pathA, SRT_BLOCK_IN_SYNC)
    writeFileSync(pathB, SRT_BLOCK_OFFSET_500MS)

    expect(areSubtitlesOutOfSync(pathA, pathB)).toBe(true)
  })

  testWithTestDir('should return false when offset is within 300ms threshold', ({ testDir }) => {
    const pathA = join(testDir, 'a.srt')
    const pathB = join(testDir, 'b.srt')
    writeFileSync(pathA, SRT_BLOCK_IN_SYNC)
    writeFileSync(pathB, SRT_BLOCK_OFFSET_100MS)

    expect(areSubtitlesOutOfSync(pathA, pathB)).toBe(false)
  })

  testWithTestDir('should return false when either file is empty / missing timestamps', ({ testDir }) => {
    const pathA = join(testDir, 'a.srt')
    const pathB = join(testDir, 'b.srt')
    writeFileSync(pathA, '')
    writeFileSync(pathB, SRT_BLOCK_IN_SYNC)

    expect(areSubtitlesOutOfSync(pathA, pathB)).toBe(false)
  })
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
