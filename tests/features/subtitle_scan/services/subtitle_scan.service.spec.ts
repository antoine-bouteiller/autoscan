/* oxlint-disable unicorn/no-null, autoscan/no-shape-in-symbol-names -- registry columns are nullable and profile results expose a shape. */
import { beforeEach } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { failNextStatement, testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { type CorpusMedia, cut, loadCorpus, quarters, trackOf, transform } from '@tests/fixtures/subtitle_scan/corpus'
import { describe, expect, it } from '@tests/it'
import { modifySubtitleMock } from '@tests/mocks/bazarr.mock'
import { MockBazarrClient, MockTelegramClient, sendMessageMock } from '@tests/utils'
import { Cause, Effect, Exit, FileSystem, Logger, type Scope } from 'effect'

import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { getScan, recordScan } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { statFile } from '@/features/subtitle_scan/services/scan_registry.service'
import { type Cue, profilePair } from '@/features/subtitle_scan/services/subtitle_profile'
import { scanMediaSubtitles, type SubtitleScanPass } from '@/features/subtitle_scan/services/subtitle_scan.service'
import {
  type BazarrItem,
  type BazarrItemRef,
  type BazarrSubtitleRef,
  type SubtitleFit as Fit,
  type SubtitleSource,
} from '@/integrations/bazarr/bazarr.service'
import { type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { normalizeToIso1 } from '@/shared/utils/iso_codes'

const timestamp = (seconds: number) => new Date(Math.max(0, Math.round(seconds * 1000))).toISOString().slice(11, 23).replace('.', ',')
const srt = (cues: readonly Cue[]) =>
  cues
    .map(
      (cue, index) => `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\ntext ${cue.anchors.map((anchor) => `A${anchor}`).join(' ')}`
    )
    .join('\n\n')
const corpus = await loadCorpus()
const mediaOf = (id: string) => {
  const media = corpus.find((item) => item.id === id)
  if (media === undefined) {
    throw new Error(`Missing ${id}`)
  }
  return media
}
class ScanBazarr extends MockBazarrClient {
  readonly repairs: { path: string; fit: Fit }[] = []
  readonly blacklists: { path: string; source: SubtitleSource }[] = []
  readonly deletes: string[] = []
  sources = new Map<string, SubtitleSource>()
  lookups = 0
  onRepair: (subtitle: BazarrSubtitleRef, fit: Fit) => Effect.Effect<void> = () => Effect.void
  onSources: () => Effect.Effect<void> = () => Effect.void
  onBlacklist: () => Effect.Effect<void> = () => Effect.void
  override modifySubtitle(_item: BazarrItemRef, subtitle: BazarrSubtitleRef, fit: Fit) {
    return Effect.sync(() => {
      this.repairs.push({ fit, path: subtitle.path })
    }).pipe(Effect.flatMap(() => this.onRepair(subtitle, fit)))
  }
  override getSubtitleSources() {
    return Effect.sync(() => {
      this.lookups++
    }).pipe(
      Effect.flatMap(() => this.onSources()),
      Effect.as(this.sources)
    )
  }
  override blacklistSubtitle(_item: BazarrItemRef, subtitle: BazarrSubtitleRef, source: Extract<SubtitleSource, { kind: 'provider' }>) {
    return Effect.sync(() => {
      this.blacklists.push({ path: subtitle.path, source })
    }).pipe(Effect.flatMap(() => this.onBlacklist()))
  }
  override deleteSubtitle(_item: BazarrItemRef, subtitle: BazarrSubtitleRef) {
    return Effect.sync(() => {
      this.deletes.push(subtitle.path)
    })
  }
}
const newPass = (): SubtitleScanPass => ({ sampled: new Set() })
type MutableFfmpeg = { -readonly [Key in keyof IFfmpegClient]: IFfmpegClient[Key] }
const setup = (media: CorpusMedia, tracks: Record<string, readonly Cue[]>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped()
    const file = `${directory}/Movie.mkv`
    yield* fs.writeFileString(file, '')
    const paths: Record<string, string> = {}
    const item: BazarrItem = { id: 7, kind: 'movie', missingSubtitles: [], path: file, subtitles: [], title: 'Movie' }
    for (const [language, cues] of Object.entries(tracks)) {
      const path = `${directory}/Movie.${language}.srt`
      paths[language] = path
      yield* fs.writeFileString(path, srt(cues))
      const normalized = normalizeToIso1(language)
      if (normalized === undefined) {
        throw new Error(`Unrecognised test language ${language}`)
      }
      item.subtitles.push({ forced: false, hi: false, language: normalized, path })
    }
    yield* Effect.promise(
      () =>
        testSql`INSERT INTO transcode_scans (file_path, original_language, scan_version, scanned_at) VALUES (${file}, 'en', 0, NOW()) ON CONFLICT DO NOTHING`
    )
    const bazarr = new ScanBazarr()
    const samples: Parameters<IFfmpegClient['sampleSpeech']>[] = []
    const ffmpeg: MutableFfmpeg = {
      execute: () => Effect.succeed(''),
      executeFfmpeg: () => Effect.succeed(''),
      ffprobe: () => Effect.succeed({ duration: media.duration, streams: [{ codec_type: 'audio', index: 3, tags: { language: 'en' } }] }),
      sampleSpeech: (...args) =>
        Effect.sync(() => {
          samples.push(args)
          return media.windows
        }),
    }
    const details = { file, mediaTitle: 'Movie', mediaType: 'movie' as const, originalLanguage: 'en' as const, preferredLanguage: 'en' as const }
    const run = (pass: SubtitleScanPass = newPass(), fileSystem = fs) =>
      provideTest(scanMediaSubtitles(details, Effect.succeed(item), pass).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem)), {
        bazarr,
        ffmpeg,
      })
    const row = (language: string) => provideTest(getScan(paths[language], SUBTITLE_SCAN_VERSION))
    return { bazarr, details, ffmpeg, file, fs, item, paths, row, run, samples }
  })
const seedReference = (fixture: Effect.Success<ReturnType<typeof setup>>, language = 'en') =>
  Effect.gen(function* () {
    const stat = yield* statFile(fixture.paths[language])
    yield* provideTest(
      recordScan({
        evidence: 'audio',
        fileMtime: stat.mtime,
        filePath: fixture.paths[language],
        fileSize: stat.size,
        scanVersion: SUBTITLE_SCAN_VERSION,
        scannedAt: new Date(),
        verdict: 'passed',
      })
    )
  })
const synthetic = (initialSeed = 41): CorpusMedia => {
  let seed = initialSeed
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647
    return seed / 2_147_483_647
  }
  const cues: Cue[] = []
  for (let start = 1; start < 998; start += 2 + random() * 4) {
    cues.push({ anchors: [String(cues.length + 1000)], end: start + 1 + random(), start })
  }
  return {
    duration: 1000,
    id: 'synthetic',
    name: 'Synthetic',
    tracks: new Map([['en', { cues, label: '', language: 'en', status: '' }]]),
    windows: [0.06, 0.18, 0.3, 0.42, 0.54, 0.66, 0.78, 0.9].map((fraction) => ({
      duration: 40,
      speech: cues
        .filter((cue) => cue.end > 1000 * fraction && cue.start < 1000 * fraction + 40)
        .map((cue) => [Math.max(cue.start, 1000 * fraction), Math.min(cue.end, 1000 * fraction + 40)] as const),
      start: 1000 * fraction,
    })),
  }
}
const provider = { kind: 'provider' as const, provider: 'opensubtitlescom', subsId: 'download-id' }
const testCase = <Error>(name: string, body: () => Effect.Effect<void, Error, FileSystem.FileSystem | Scope.Scope>) =>
  it.live(name, () => body().pipe(Effect.scoped, Effect.provide(BunServices.layer)))

describe('scanMediaSubtitles', () => {
  beforeEach(async () => {
    sendMessageMock.mockReset().mockResolvedValue(100)
    modifySubtitleMock.mockReset().mockResolvedValue(undefined)
    await testSql`DELETE FROM subtitle_scans`
    await testSql`DELETE FROM transcode_scans`
  })

  testCase('[VC-10.1] speech-aligned English passes independently of a piecewise French sibling', () =>
    Effect.gen(function* () {
      const media = mediaOf('m10')
      const fixture = yield* setup(media, { en: trackOf(media, 'en').cues, fr: quarters(trackOf(media, 'fr').cues, media.duration) })
      yield* fixture.run()
      expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      expect(fixture.bazarr.repairs).toHaveLength(0)
      expect(sendMessageMock.mock.calls.every((call) => !call[1].endsWith('(en)'))).toBeTrue()
    })
  )

  for (const [id, other] of [
    ['[VC-10.1] other-cut', 'other-cut'],
    ['[VC-10.1] other-episode', 'm43'],
  ]) {
    testCase(`${id} French cannot condemn aligned English`, () =>
      Effect.gen(function* () {
        const media = mediaOf(other === 'm43' ? 'm24' : 'm10')
        const otherCut = trackOf(media, 'fr').cues.map((cue) => {
          const offset = cue.start > media.duration / 2 ? 200 : 0
          return { ...cue, end: cue.end + offset, start: cue.start + offset }
        })
        const french = other === 'm43' ? trackOf(mediaOf(other), 'fr').cues : otherCut
        const fixture = yield* setup(media, { en: trackOf(media, 'en').cues, fr: french })
        yield* fixture.run()
        expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
        expect(sendMessageMock.mock.calls.every((call) => !call[1].endsWith('(en)'))).toBeTrue()
      })
    )
  }

  testCase('[VC-10.1] Room Next Door resegmented French passes against verified English', () =>
    Effect.gen(function* () {
      const media = mediaOf('m13')
      const fixture = yield* setup(media, { en: trackOf(media, 'en').cues, fr: trackOf(media, 'fr').cues })
      yield* fixture.run()
      expect(yield* fixture.row('fr')).toMatchObject({ evidence: 'reference', verdict: 'passed' })
      expect(fixture.bazarr.repairs).toHaveLength(0)
      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  )

  for (const [language, ratio, offset] of [
    ['en', 1, 5],
    ['en', 1.0425, -52],
    ['fr', 1, 5],
    ['fr', 25 / 23.976, 0],
  ] as const) {
    testCase(`[VC-18] repairs ${language} ratio ${ratio} offset ${offset} once and verifies the rewritten identity`, () =>
      Effect.gen(function* () {
        const effectContext = yield* Effect.context()

        const media = synthetic()
        const { cues } = trackOf(media, 'en')
        const fixture = yield* setup(
          media,
          language === 'en' ? { en: transform(cues, ratio, offset) } : { en: cues, fr: transform(cues, ratio, offset) }
        )
        modifySubtitleMock.mockImplementation(async (_item, subtitle) => {
          await Effect.runPromiseWith(effectContext)(fixture.fs.writeFileString(subtitle.path, srt(cues)))
        })
        yield* provideTest(scanMediaSubtitles(fixture.details, Effect.succeed(fixture.item), newPass()), {
          bazarr: new MockBazarrClient(),
          ffmpeg: fixture.ffmpeg,
        })
        expect(modifySubtitleMock).toHaveBeenCalledTimes(1)
        const [[requestedItem, requestedSubtitle, fit]] = modifySubtitleMock.mock.calls
        expect(requestedItem).toEqual(fixture.item)
        expect(requestedSubtitle.path).toBe(fixture.paths[language])
        if (language === 'en' && ratio !== 1) {
          expect(Math.abs(fit.ratio - ratio)).toBeLessThanOrEqual(0.002)
          expect(Math.abs(fit.offset - offset)).toBeLessThanOrEqual(1)
        } else {
          expect(fit.offset).toBeCloseTo(offset, ratio === 1 ? 5 : 0)
          expect(fit.ratio).toBe(ratio)
        }
        if (ratio === 1) {
          expect(Math.round(-1000 * fit.offset)).toBe(-5000)
        }
        expect(yield* fixture.row(language)).toMatchObject({ evidence: language === 'en' ? 'audio' : 'reference', verdict: 'passed' })
        const stat = yield* statFile(fixture.paths[language])
        expect(yield* fixture.row(language)).toMatchObject({ fileMtime: stat.mtime, fileSize: stat.size })
        yield* fixture.run()
        expect(modifySubtitleMock).toHaveBeenCalledTimes(1)
        expect(fixture.samples).toHaveLength(1)
      })
    )
  }

  testCase('[VC-18] still misaligned after repair is invalid with delete button, never a second repair or blacklist', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const fixture = yield* setup(media, { en: transform(trackOf(media, 'en').cues, 1, 5) })
      fixture.bazarr.sources.set(fixture.paths['en'], provider)
      yield* fixture.run()
      expect(yield* fixture.row('en')).toMatchObject({ evidence: null, verdict: 'invalid' })
      expect(fixture.bazarr.repairs).toHaveLength(1)
      expect(fixture.bazarr.blacklists).toHaveLength(0)
      expect(fixture.bazarr.lookups).toBe(0)
      expect(sendMessageMock.mock.calls[0][2]?.replyMarkup?.inline_keyboard[0]).toHaveLength(1)
    })
  )

  for (const [language, classification] of [
    ['en', 'truncated'],
    ['fr', 'piecewise'],
    ['fr', 'coverage'],
    ['fr', 'unrelated'],
  ] as const) {
    testCase(`[VC-8.1][VC-20] ${language} ${classification} is invalid without repair and provider-blacklisted`, () =>
      Effect.gen(function* () {
        const media = classification === 'unrelated' ? mediaOf('m24') : synthetic()
        const { cues } = trackOf(media, 'en')
        const shortened = classification === 'unrelated' ? trackOf(mediaOf('m43'), 'fr').cues : cut(cues, media.duration)
        const broken = classification === 'piecewise' ? quarters(cues, media.duration) : shortened
        const fixture = yield* setup(media, language === 'en' ? { en: broken } : { en: cues, fr: broken })
        if (classification === 'unrelated') {
          expect(profilePair(cues, broken, media.duration).shape).toBe('unrelated')
        }
        fixture.bazarr.sources.set(fixture.paths[language], provider)
        yield* fixture.run()
        expect(yield* fixture.row(language)).toMatchObject({ evidence: null, verdict: 'invalid' })
        expect(fixture.bazarr.repairs).toHaveLength(0)
        expect(fixture.bazarr.blacklists).toEqual([{ path: fixture.paths[language], source: provider }])
        expect(fixture.bazarr.deletes).toHaveLength(0)
        expect(sendMessageMock.mock.calls[0]).toEqual([
          expect.any(Number),
          `Blacklisted invalid subtitle for Movie (${language}); Bazarr is searching for another.`,
          undefined,
        ])
      })
    )
  }

  testCase('[VC-8.1] coverage runs after repairing a complete French track 100 seconds late', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const cues = trackOf(media, 'en').cues.filter((cue) => cue.end < 980)
      const fixture = yield* setup(media, { en: cues, fr: transform(cues, 1, 100) })
      yield* seedReference(fixture)
      fixture.bazarr.onRepair = (subtitle) => fixture.fs.writeFileString(subtitle.path, srt(cues)).pipe(Effect.orDie)
      yield* fixture.run()
      expect(fixture.bazarr.repairs).toHaveLength(1)
      expect(yield* fixture.row('fr')).toMatchObject({ evidence: 'reference', verdict: 'passed' })
    })
  )

  testCase('[VC-12.1] fewer than four informative windows is terminal inconclusive without alerts or repair', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const fixture = yield* setup({ ...media, windows: media.windows.slice(0, 3) }, { en: trackOf(media, 'en').cues })
      yield* fixture.run()
      expect(yield* fixture.row('en')).toMatchObject({ evidence: null, verdict: 'inconclusive' })
      expect(fixture.bazarr.repairs).toHaveLength(0)
      expect(sendMessageMock).not.toHaveBeenCalled()
      yield* fixture.run()
      expect(fixture.samples).toHaveLength(1)
    })
  )

  testCase('[VC-19] lone and version-2 passed English candidates are speech assessed; DH S01E04 m16 is not passed', () =>
    Effect.gen(function* () {
      const media = mediaOf('m16')
      const fixture = yield* setup(media, { en: trackOf(media, 'en').cues })
      yield* provideTest(
        recordScan({
          evidence: null,
          fileMtime: null,
          filePath: fixture.paths['en'],
          fileSize: null,
          scanVersion: 2,
          scannedAt: new Date(),
          verdict: 'passed',
        })
      )
      yield* fixture.run()
      expect(fixture.samples).toHaveLength(1)
      expect((yield* fixture.row('en'))?.verdict).not.toBe('passed')
      expect((yield* fixture.row('en'))?.scanVersion).toBe(3)
    })
  )

  for (const identity of ['size', 'mtime'] as const) {
    testCase(`[VC-6.1] stale ${identity} rechecks but a matching row skips without read, probe or Bazarr`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const fixture = yield* setup(media, { en: trackOf(media, 'en').cues })
        yield* seedReference(fixture)
        const noRead = { ...fixture.fs, readFile: () => Effect.die('matching row must not read') }
        yield* provideTest(
          scanMediaSubtitles(fixture.details, Effect.die('matching row must not fetch Bazarr'), newPass()).pipe(
            Effect.provideService(FileSystem.FileSystem, noRead)
          ),
          {
            ffmpeg: { ...fixture.ffmpeg, ffprobe: () => Effect.die('matching row must not probe') },
          }
        )
        expect(fixture.samples).toHaveLength(0)
        yield* identity === 'size'
          ? fixture.fs.writeFileString(fixture.paths['en'], `${srt(trackOf(media, 'en').cues)}\n`)
          : fixture.fs.utimes(fixture.paths['en'], new Date(0), new Date(0))
        yield* fixture.run()
        expect(fixture.samples).toHaveLength(1)
        expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      })
    )
  }

  testCase('[VC-6.1] changed stat around read drops only that track with no row', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, eng: cues })
      const racing = {
        ...fixture.fs,
        readFile: (path: string) =>
          fixture.fs
            .readFile(path)
            .pipe(Effect.tap(() => (path === fixture.paths['en'] ? fixture.fs.writeFileString(path, `${srt(cues)}\n`) : Effect.void))),
      }
      yield* fixture.run(newPass(), racing)
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(yield* fixture.row('eng')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
    })
  )

  testCase('[VC-6.1] changed file before PATCH gets no repair, row or alert', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const fixture = yield* setup(media, { en: transform(trackOf(media, 'en').cues, 1, 5) })
      fixture.ffmpeg.sampleSpeech = (...args) =>
        fixture.fs.writeFileString(fixture.paths['en'], `${srt(trackOf(media, 'en').cues)}\n`).pipe(
          Effect.orDie,
          Effect.tap(() =>
            Effect.sync(() => {
              fixture.samples.push(args)
            })
          ),
          Effect.as(media.windows)
        )
      yield* fixture.run()
      expect(fixture.bazarr.repairs).toHaveLength(0)
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  )

  testCase('[VC-6.1] changed file before POST gets no blacklist, row or alert', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cut(cues, media.duration) })
      fixture.bazarr.sources.set(fixture.paths['en'], provider)
      fixture.bazarr.onSources = () => fixture.fs.writeFileString(fixture.paths['en'], srt(cues)).pipe(Effect.orDie)
      yield* fixture.run()
      expect(fixture.bazarr.blacklists).toHaveLength(0)
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  )

  testCase('[VC-6.1] blacklist stores assessed stat before a replacement arrives, which is eligible next pass', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cut(cues, media.duration) })
      const assessed = yield* statFile(fixture.paths['en'])
      fixture.bazarr.sources.set(fixture.paths['en'], provider)
      fixture.bazarr.onBlacklist = () => fixture.fs.writeFileString(fixture.paths['en'], srt(cues)).pipe(Effect.orDie)
      yield* fixture.run()
      expect(yield* fixture.row('en')).toMatchObject({ fileMtime: assessed.mtime, fileSize: assessed.size, verdict: 'invalid' })
      yield* fixture.run()
      expect(fixture.samples).toHaveLength(2)
      expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
    })
  )

  testCase('[VC-11.1] two English sidecars share one 8x40s sample and French-only later candidate does not sample', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, eng: cues })
      const pass = { sampled: new Set<string>() }
      yield* fixture.run(pass)
      expect(fixture.samples).toEqual([[fixture.file, 0, [60, 180, 300, 420, 540, 660, 780, 900].map((start) => ({ duration: 40, start }))]])
      expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      expect(yield* fixture.row('eng')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      yield* fixture.fs.writeFileString(fixture.file.replace('.mkv', '.fr.srt'), srt(cues))
      yield* fixture.run(newPass())
      expect(fixture.samples).toHaveLength(1)
      expect(yield* provideTest(getScan(fixture.file.replace('.mkv', '.fr.srt'), SUBTITLE_SCAN_VERSION))).toMatchObject({
        evidence: 'reference',
        verdict: 'passed',
      })
    })
  )

  testCase('[VC-11.1] failed sample counts and cannot retry in the same pass; media failure leaves all candidates without rows', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, eng: cues, fr: cues })
      yield* seedReference(fixture)
      const pass = { sampled: new Set<string>() }
      let calls = 0
      fixture.ffmpeg.sampleSpeech = () =>
        Effect.sync(() => {
          calls++
        }).pipe(Effect.flatMap(() => Effect.die('failed sample')))
      yield* Effect.exit(fixture.run(pass))
      expect(yield* fixture.row('eng')).toBeUndefined()
      expect(yield* fixture.row('fr')).toBeUndefined()
      expect(pass.sampled.has(fixture.file)).toBeTrue()
      yield* fixture.run(pass)
      expect(calls).toBe(1)
      expect(yield* fixture.row('eng')).toBeUndefined()
      expect(yield* fixture.row('fr')).toMatchObject({ evidence: 'reference', verdict: 'passed' })
    })
  )

  for (const fallback of ['translation', 'missing source', 'missing subtitle', 'lookup failure', 'blacklist failure'] as const) {
    testCase(`[VC-20] ${fallback} keeps invalid row and delete-button alert, never DELETE`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const fixture = yield* setup(media, { en: cut(trackOf(media, 'en').cues, media.duration) })
        if (fallback !== 'missing source') {
          fixture.bazarr.sources.set(fixture.paths['en'], fallback === 'translation' ? { kind: 'translation' } : provider)
        }
        if (fallback === 'missing subtitle') {
          fixture.item.subtitles = []
        }
        if (fallback === 'lookup failure') {
          fixture.bazarr.onSources = () => Effect.die('history unavailable')
        }
        if (fallback === 'blacklist failure') {
          fixture.bazarr.onBlacklist = () => Effect.die('blacklist unavailable')
        }
        const persistedAtNotification: string[] = []
        sendMessageMock.mockImplementationOnce(async () => {
          const rows = await testSql<{ verdict: string }[]>`SELECT verdict FROM subtitle_scans WHERE file_path = ${fixture.paths['en']}`
          persistedAtNotification.push(rows[0]?.verdict ?? 'missing')
          throw new Error('Telegram unavailable')
        })
        yield* fixture.run()
        expect(persistedAtNotification).toEqual(['invalid'])
        expect(yield* fixture.row('en')).toMatchObject({ evidence: null, verdict: 'invalid' })
        expect(sendMessageMock.mock.calls[0][1]).toBe('Invalid subtitle for Movie (en)')
        expect(sendMessageMock.mock.calls[0][2]?.replyMarkup?.inline_keyboard[0]).toHaveLength(1)
        expect(fixture.bazarr.deletes).toHaveLength(0)
        expect(fixture.bazarr.blacklists).toHaveLength(fallback === 'blacklist failure' ? 1 : 0)
      })
    )
  }

  testCase('[VC-20] source history is lazy and fetched at most once for several invalid tracks', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { de: cut(cues, media.duration), en: cues, fr: quarters(cues, media.duration) })
      fixture.bazarr.sources.set(fixture.paths['fr'], provider)
      fixture.bazarr.sources.set(fixture.paths['de'], provider)
      yield* fixture.run()
      expect(fixture.bazarr.lookups).toBe(1)
      expect(fixture.bazarr.blacklists).toHaveLength(2)
    })
  )

  testCase('[VC-8.1][VC-20] uncorrectable English and real Hateful Eight m11 truncation are invalid without repair', () =>
    Effect.gen(function* () {
      for (const media of [synthetic(), mediaOf('m11')]) {
        const { cues } = trackOf(media, 'en')
        const fixture = yield* setup(media, { en: media.id === 'm11' ? cues : quarters(cues, media.duration) })
        fixture.bazarr.sources.set(fixture.paths['en'], provider)
        yield* fixture.run()
        expect(yield* fixture.row('en')).toMatchObject({ evidence: null, verdict: 'invalid' })
        expect(fixture.bazarr.repairs).toHaveLength(0)
        expect(fixture.bazarr.blacklists).toHaveLength(1)
      }
    })
  )

  for (const classification of ['agree', 'piecewise'] as const) {
    testCase(`[VC-19][VC-8.1] French translation is judged by its ${classification} profile, never history score`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const { cues } = trackOf(media, 'en')
        const fixture = yield* setup(media, { en: cues, fr: classification === 'agree' ? cues : quarters(cues, media.duration) })
        fixture.bazarr.sources.set(fixture.paths['fr'], { kind: 'translation' })
        yield* fixture.run()
        expect(yield* fixture.row('fr')).toMatchObject({
          evidence: classification === 'agree' ? 'reference' : null,
          verdict: classification === 'agree' ? 'passed' : 'invalid',
        })
        expect(fixture.bazarr.blacklists).toHaveLength(0)
        expect(fixture.bazarr.lookups).toBe(classification === 'agree' ? 0 : 1)
        if (classification === 'piecewise') {
          expect(sendMessageMock.mock.calls[0][2]?.replyMarkup?.inline_keyboard[0]).toHaveLength(1)
        } else {
          expect(sendMessageMock).not.toHaveBeenCalled()
        }
      })
    )
  }

  testCase('[VC-19] translated English is speech-repaired; French inheriting its old drift is repaired against the new reference', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const drift = transform(cues, 1.0425, -52)
      const fixture = yield* setup(media, { en: drift, fr: drift })
      fixture.bazarr.sources.set(fixture.paths['en'], { kind: 'translation' })
      fixture.bazarr.sources.set(fixture.paths['fr'], { kind: 'translation' })
      fixture.bazarr.onRepair = (subtitle) => fixture.fs.writeFileString(subtitle.path, srt(cues)).pipe(Effect.orDie)
      yield* fixture.run()
      expect(fixture.samples).toHaveLength(1)
      expect(fixture.bazarr.repairs.map((repair) => repair.path)).toEqual([fixture.paths['en'], fixture.paths['fr']])
      for (const repair of fixture.bazarr.repairs) {
        expect(repair.fit.ratio).toBeCloseTo(1.0425, 3)
      }
      expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      expect(yield* fixture.row('fr')).toMatchObject({ evidence: 'reference', verdict: 'passed' })
      expect(fixture.bazarr.blacklists).toHaveLength(0)
    })
  )

  for (const unavailable of ['absent', 'invalid', 'inconclusive', 'cap', 'transcode'] as const) {
    testCase(`[VC-19] French waits with ${unavailable} English reference; forced-looking sibling is still deleted`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const { cues } = trackOf(media, 'en')
        const fixture = yield* setup(media, unavailable === 'absent' ? { fr: cues } : { en: cues, fr: cues })
        fixture.bazarr.sources.set(fixture.paths['fr'], { kind: 'translation' })
        if (unavailable === 'invalid' || unavailable === 'inconclusive') {
          const stat = yield* statFile(fixture.paths['en'])
          yield* provideTest(
            recordScan({
              evidence: null,
              fileMtime: stat.mtime,
              filePath: fixture.paths['en'],
              fileSize: stat.size,
              scanVersion: SUBTITLE_SCAN_VERSION,
              scannedAt: new Date(),
              verdict: unavailable,
            })
          )
        }
        if (unavailable === 'transcode') {
          yield* Effect.promise(() => testSql`DELETE FROM transcode_scans WHERE file_path = ${fixture.file}`)
        }
        const pass = { sampled: new Set(unavailable === 'cap' ? Array.from({ length: 60 }, (_entry, index) => String(index)) : []) }
        yield* fixture.run(pass)
        expect(yield* fixture.row('fr')).toBeUndefined()
        expect(fixture.samples).toHaveLength(0)
        expect(fixture.bazarr.lookups).toBe(0)
        yield* fixture.fs.writeFileString(fixture.paths['fr'], '1\n00:00:01,000 --> 00:00:02,000\nforced')
        yield* fixture.run(pass)
        expect(fixture.bazarr.deletes).toEqual([fixture.paths['fr']])
        expect(yield* fixture.row('fr')).toBeUndefined()
      })
    )
  }

  testCase('[VC-19] smallest passing English path is the reference and all English candidates use the same sample', () =>
    Effect.gen(function* () {
      const original = synthetic()
      const media = { ...original, windows: original.windows.map((window) => (window.start >= 780 ? { ...window, speech: [] } : window)) }
      const { cues } = trackOf(media, 'en')
      const tailMissing = cues.filter((cue) => cue.end < 700)
      const fixture = yield* setup(media, { en: tailMissing, eng: cues, fr: tailMissing })
      yield* fixture.run()
      expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      expect(yield* fixture.row('eng')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      // The smaller English path fails coverage; picking .eng instead would invalidate French.
      expect(yield* fixture.row('fr')).toMatchObject({ evidence: 'reference', verdict: 'passed' })
      expect(fixture.samples).toHaveLength(1)
    })
  )

  for (const streams of [
    [],
    [{ codec_type: 'audio', index: 0, tags: { language: 'fr' as const } }],
    [
      { codec_type: 'audio', index: 0, tags: { language: 'en' as const } },
      { codec_type: 'audio', index: 1, tags: { language: 'en' as const } },
    ],
  ]) {
    testCase(`[VC-11.1] ${streams.length} streams without a unique original-language match warn and wait`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const fixture = yield* setup(media, { en: trackOf(media, 'en').cues })
        fixture.ffmpeg.ffprobe = () => Effect.succeed({ duration: media.duration, streams })
        const messages: unknown[] = []
        const logger = Logger.make((entry) => {
          messages.push(entry.message)
        })
        yield* provideTest(
          scanMediaSubtitles(fixture.details, Effect.succeed(fixture.item), newPass()).pipe(
            Effect.provideService(Logger.CurrentLoggers, new Set([logger]))
          ),
          { bazarr: fixture.bazarr, ffmpeg: fixture.ffmpeg }
        )
        expect(fixture.samples).toHaveLength(0)
        expect(yield* fixture.row('en')).toBeUndefined()
        expect(JSON.stringify(messages)).toContain('Expected exactly one original-language audio stream')
      })
    )
  }

  for (const originalLanguage of ['ja', 'fr'] as const) {
    testCase(`[VC-11.1] transcode row for another language does not authorise sampling ${originalLanguage}`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const fixture = yield* setup(media, { en: trackOf(media, 'en').cues })
        yield* provideTest(scanMediaSubtitles({ ...fixture.details, originalLanguage }, Effect.succeed(fixture.item), newPass()), {
          bazarr: fixture.bazarr,
          ffmpeg: fixture.ffmpeg,
        })
        expect(fixture.samples).toHaveLength(0)
        expect(yield* fixture.row('en')).toBeUndefined()
      })
    )
  }

  testCase('[VC-11.1] Japanese original selects audio index zero, not global stream index or the English dub', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const fixture = yield* setup(media, { en: trackOf(media, 'en').cues })
      yield* Effect.promise(() => testSql`UPDATE transcode_scans SET original_language = 'ja' WHERE file_path = ${fixture.file}`)
      fixture.ffmpeg.ffprobe = () =>
        Effect.succeed({
          duration: media.duration,
          streams: [
            { codec_type: 'video', index: 0 },
            { codec_type: 'audio', index: 2, tags: { language: 'ja' } },
            { codec_type: 'audio', index: 3, tags: { language: 'en' } },
          ],
        })
      yield* provideTest(scanMediaSubtitles({ ...fixture.details, originalLanguage: 'ja' }, Effect.succeed(fixture.item), newPass()), {
        bazarr: fixture.bazarr,
        ffmpeg: fixture.ffmpeg,
      })
      expect(fixture.samples[0][1]).toBe(0)
      expect(yield* fixture.row('en')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
    })
  )

  testCase('[VC-6.1] a reference changing around its read leaves French unjudged', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, fr: cues })
      yield* seedReference(fixture)
      const racing = {
        ...fixture.fs,
        readFile: (path: string) =>
          fixture.fs
            .readFile(path)
            .pipe(Effect.tap(() => (path === fixture.paths['en'] ? fixture.fs.writeFileString(path, `${srt(cues)}\n`) : Effect.void))),
      }
      yield* fixture.run(newPass(), racing)
      expect(yield* fixture.row('fr')).toBeUndefined()
      expect(fixture.samples).toHaveLength(0)
    })
  )

  for (const failure of ['read', 'stat', 'missing repair entry', 'repair', 'repair read'] as const) {
    testCase(`[VC-12.1] per-track ${failure} failure leaves no row and continues`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const { cues } = trackOf(media, 'en')
        const fixture = yield* setup(media, { en: transform(cues, 1, 5), eng: cues })
        if (failure === 'missing repair entry') {
          fixture.item.subtitles = fixture.item.subtitles.filter((subtitle) => subtitle.path !== fixture.paths['en'])
        }
        if (failure === 'repair') {
          fixture.bazarr.onRepair = () => Effect.die('repair unavailable')
        }
        if (failure === 'repair read') {
          fixture.bazarr.onRepair = (subtitle) => fixture.fs.remove(subtitle.path).pipe(Effect.orDie)
        }
        const fileSystem = {
          ...fixture.fs,
          readFile: (path: string) =>
            failure === 'read' && path === fixture.paths['en'] ? Effect.die('read unavailable') : fixture.fs.readFile(path),
          stat: (path: string) => (failure === 'stat' && path === fixture.paths['en'] ? Effect.die('stat unavailable') : fixture.fs.stat(path)),
        }
        yield* fixture.run(newPass(), fileSystem)
        expect(yield* fixture.row('en')).toBeUndefined()
        expect(yield* fixture.row('eng')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
        expect(sendMessageMock).not.toHaveBeenCalled()
      })
    )
  }

  testCase('[VC-12.1] probe failure leaves all candidates without rows and interruption is never swallowed', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, fr: cues })
      fixture.ffmpeg.ffprobe = () => Effect.die('probe unavailable')
      expect((yield* Effect.exit(fixture.run()))._tag).toBe('Failure')
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(yield* fixture.row('fr')).toBeUndefined()
      fixture.ffmpeg.ffprobe = () => Effect.interrupt
      const interrupted = yield* Effect.exit(fixture.run())
      expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBeTrue()
    })
  )

  testCase('[VC-12.1] transcode lookup failure leaves the entire media unjudged', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, fr: cues })
      const restore = failNextStatement('SELECT', new Error('transcode lookup unavailable'), 2)
      const result = yield* Effect.exit(fixture.run()).pipe(Effect.ensuring(Effect.sync(restore)))
      expect(result._tag).toBe('Failure')
      expect(fixture.samples).toHaveLength(0)
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(yield* fixture.row('fr')).toBeUndefined()
    })
  )

  testCase('[VC-12.1] registry write failure cannot emit an alert or pass the failed track and later tracks continue', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cut(cues, media.duration), eng: cues })
      const restore = failNextStatement('INSERT', new Error('registry unavailable'))
      yield* fixture.run().pipe(Effect.ensuring(Effect.sync(restore)))
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(yield* fixture.row('eng')).toMatchObject({ evidence: 'audio', verdict: 'passed' })
      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  )

  for (const language of ['en', 'fr'] as const) {
    testCase(`[VC-18] ${language} repair recheck can become inconclusive without alert or another repair`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const { cues } = trackOf(media, 'en')
        const fixture = yield* setup(media, language === 'en' ? { en: transform(cues, 1, 5) } : { en: cues, fr: transform(cues, 1, 5) })
        const unclear = language === 'en' ? [{ anchors: [], end: media.duration, start: 0 }] : cues.filter((cue) => cue.end < 170)
        fixture.bazarr.onRepair = (subtitle) => fixture.fs.writeFileString(subtitle.path, srt(unclear)).pipe(Effect.orDie)
        yield* fixture.run()
        expect(yield* fixture.row(language)).toMatchObject({ evidence: null, verdict: 'inconclusive' })
        expect(fixture.bazarr.repairs).toHaveLength(1)
        expect(fixture.bazarr.blacklists).toHaveLength(0)
        expect(sendMessageMock).not.toHaveBeenCalled()
      })
    )
  }

  testCase('[VC-18] French still drifting after repair is invalid with delete button and no blacklist or second repair', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, fr: transform(cues, 1, 5) })
      fixture.bazarr.sources.set(fixture.paths['fr'], provider)
      yield* fixture.run()
      expect(yield* fixture.row('fr')).toMatchObject({ evidence: null, verdict: 'invalid' })
      expect(fixture.bazarr.repairs).toHaveLength(1)
      expect(fixture.bazarr.lookups).toBe(0)
      expect(fixture.bazarr.blacklists).toHaveLength(0)
      expect(sendMessageMock.mock.calls[0][2]?.replyMarkup?.inline_keyboard[0]).toHaveLength(1)
    })
  )

  testCase('assessment logs carry numeric windows and profile shapes, never subtitle text', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: cues, fr: cues })
      yield* fixture.fs.writeFileString(fixture.paths['en'], srt(cues).replaceAll('text', 'never-log-this-dialogue'))
      const messages: unknown[] = []
      const logger = Logger.make((entry) => {
        messages.push(entry.message)
      })
      yield* provideTest(
        scanMediaSubtitles(fixture.details, Effect.succeed(fixture.item), newPass()).pipe(
          Effect.provideService(Logger.CurrentLoggers, new Set([logger]))
        ),
        { bazarr: fixture.bazarr, ffmpeg: fixture.ffmpeg }
      )
      const logged = JSON.stringify(messages)
      for (const key of ['shape', 'offset', 'atZero', 'peak', 'margin', 'segments']) {
        expect(logged).toContain(key)
      }
      expect(logged).not.toContain('never-log-this-dialogue')
    })
  )

  for (const verdict of ['invalid', 'inconclusive'] as const) {
    testCase(`[VC-19] English judged ${verdict} this pass cannot become the French reference`, () =>
      Effect.gen(function* () {
        const original = synthetic()
        const { cues } = trackOf(original, 'en')
        const media = verdict === 'inconclusive' ? { ...original, windows: original.windows.slice(0, 3) } : original
        const fixture = yield* setup(media, { en: verdict === 'invalid' ? cut(cues, media.duration) : cues, fr: cues })
        yield* fixture.run()
        expect(yield* fixture.row('en')).toMatchObject({ evidence: null, verdict })
        expect(yield* fixture.row('fr')).toBeUndefined()
        expect(fixture.samples).toHaveLength(1)
        expect(fixture.bazarr.repairs).toHaveLength(0)
        expect(sendMessageMock.mock.calls.every((call) => !call[1].endsWith('(fr)'))).toBeTrue()
      })
    )
  }

  testCase('[VC-6.1] changing stats around the repaired re-read drops its verdict without another PATCH', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const { cues } = trackOf(media, 'en')
      const fixture = yield* setup(media, { en: transform(cues, 1, 5) })
      fixture.bazarr.onRepair = (subtitle) => fixture.fs.writeFileString(subtitle.path, srt(cues)).pipe(Effect.orDie)
      let reads = 0
      const racing = {
        ...fixture.fs,
        readFile: (path: string) =>
          fixture.fs.readFile(path).pipe(
            Effect.tap(() => {
              reads++
              return reads === 2 ? fixture.fs.writeFileString(path, `${srt(cues)}\n`) : Effect.void
            })
          ),
      }
      yield* fixture.run(newPass(), racing)
      expect(fixture.bazarr.repairs).toHaveLength(1)
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  )

  testCase('missing Bazarr item leaves candidates eligible without probing or sampling', () =>
    Effect.gen(function* () {
      const media = synthetic()
      const fixture = yield* setup(media, { en: trackOf(media, 'en').cues })
      fixture.ffmpeg.ffprobe = () => Effect.die('missing item must not probe')
      yield* provideTest(scanMediaSubtitles(fixture.details, Effect.undefined, newPass()), { bazarr: fixture.bazarr, ffmpeg: fixture.ffmpeg })
      expect(yield* fixture.row('en')).toBeUndefined()
      expect(fixture.samples).toHaveLength(0)
    })
  )

  for (const operation of ['sample', 'repair', 'history', 'blacklist', 'Telegram'] as const) {
    testCase(`[VC-12.1] ${operation} interruption propagates instead of becoming a fallback`, () =>
      Effect.gen(function* () {
        const media = synthetic()
        const { cues } = trackOf(media, 'en')
        const track = operation === 'repair' ? transform(cues, 1, 5) : cut(cues, media.duration)
        const fixture = yield* setup(media, { en: track })
        fixture.bazarr.sources.set(fixture.paths['en'], provider)
        if (operation === 'sample') {
          fixture.ffmpeg.sampleSpeech = () => Effect.interrupt
        }
        if (operation === 'repair') {
          fixture.bazarr.onRepair = () => Effect.interrupt
        }
        if (operation === 'history') {
          fixture.bazarr.onSources = () => Effect.interrupt
        }
        if (operation === 'blacklist') {
          fixture.bazarr.onBlacklist = () => Effect.interrupt
        }
        const telegram = new MockTelegramClient()
        if (operation === 'Telegram') {
          Object.defineProperty(telegram, 'sendMessage', { value: () => Effect.interrupt })
        }
        const result = yield* Effect.exit(
          provideTest(scanMediaSubtitles(fixture.details, Effect.succeed(fixture.item), newPass()), {
            bazarr: fixture.bazarr,
            ffmpeg: fixture.ffmpeg,
            telegram,
          })
        )
        expect(Exit.isFailure(result) && Cause.hasInterrupts(result.cause)).toBeTrue()
        if (operation === 'blacklist' || operation === 'Telegram') {
          expect(yield* fixture.row('en')).toMatchObject({ verdict: 'invalid' })
        } else {
          expect(yield* fixture.row('en')).toBeUndefined()
        }
      })
    )
  }
})
