/* oxlint-disable unicorn/no-null -- scan rows carry nullable evidence and stat columns. */
import { beforeEach } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { failNextStatement, testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockBazarrClient, MockTelegramClient } from '@tests/utils'
import { Cause, DateTime, Effect, Exit, FileSystem, Ref } from 'effect'
import { TestClock } from 'effect/testing'

import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { listMissing, recordScan, type SubtitleScanRecord } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { applyMissingPolicy } from '@/features/subtitle_scan/services/missing_subtitles.service'
import { type BazarrItem, type BazarrItemRef, type BazarrSubtitleRef, type IBazarrClient } from '@/integrations/bazarr/bazarr.service'
import { type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { NetworkError } from '@/shared/errors/network'
import { type ISOCode1 } from '@/shared/types/iso_codes'

const DAY = 86_400_000
type Movie = Extract<BazarrItem, { kind: 'movie' }>
interface Translation {
  item: BazarrItemRef
  source: BazarrSubtitleRef
  target: string
}

const networkError = () => NetworkError.make({ cause: 'unavailable', originalMessage: 'unavailable', serviceName: 'BazarrTest' })
const item = (overrides: Partial<Movie> = {}): Movie => ({
  id: 1,
  kind: 'movie',
  missingSubtitles: [{ forced: false, language: 'en' }],
  path: '/library/movie.mkv',
  subtitles: [],
  title: 'Movie',
  ...overrides,
})

class WantedBazarr extends MockBazarrClient {
  private readonly movies: BazarrItem[]
  private readonly episodes: BazarrItem[]
  private readonly translate: (...args: Parameters<IBazarrClient['translateSubtitle']>) => ReturnType<MockBazarrClient['translateSubtitle']>

  constructor(
    movies: BazarrItem[],
    translate: (...args: Parameters<IBazarrClient['translateSubtitle']>) => ReturnType<MockBazarrClient['translateSubtitle']>,
    episodes: BazarrItem[] = []
  ) {
    super()
    this.movies = movies
    this.episodes = episodes
    this.translate = translate
  }

  override get getWantedMovies() {
    return Effect.succeed(this.movies)
  }

  override get getWantedEpisodes() {
    return Effect.succeed(this.episodes)
  }

  override translateSubtitle(itemRef: BazarrItemRef, source: BazarrSubtitleRef, target: ISOCode1): ReturnType<MockBazarrClient['translateSubtitle']> {
    return this.translate(itemRef, source, target)
  }
}

class RecordingTelegram extends MockTelegramClient {
  private readonly send: (...args: Parameters<ITelegramClient['sendMessage']>) => ReturnType<MockTelegramClient['sendMessage']>

  constructor(send: (...args: Parameters<ITelegramClient['sendMessage']>) => ReturnType<MockTelegramClient['sendMessage']>) {
    super()
    this.send = send
  }

  override sendMessage(
    chatId: number,
    text: string,
    options?: Parameters<ITelegramClient['sendMessage']>[2]
  ): ReturnType<MockTelegramClient['sendMessage']> {
    return this.send(chatId, text, options)
  }
}

const service = (movies: BazarrItem[], episodes: BazarrItem[] = []) =>
  Effect.gen(function* () {
    const messages = yield* Ref.make<string[]>([])
    const translations = yield* Ref.make<Translation[]>([])
    const bazarr = new WantedBazarr(
      movies,
      (translatedItem, source, target) => Ref.update(translations, (calls) => [...calls, { item: translatedItem, source, target }]),
      episodes
    )
    const telegram = new RecordingTelegram((_chatId, text) => Ref.update(messages, (texts) => [...texts, text]).pipe(Effect.as(1)))
    return { bazarr, messages, telegram, translations }
  })

const noSpeechSampling: IFfmpegClient = {
  execute: () => Effect.die('unexpected execute'),
  executeFfmpeg: () => Effect.die('unexpected executeFfmpeg'),
  ffprobe: () => Effect.die('unexpected ffprobe'),
  sampleSpeech: () => Effect.die('the missing policy must not sample speech'),
}

const run = (bazarr: IBazarrClient, telegram: ITelegramClient) => provideTest(applyMissingPolicy, { bazarr, ffmpeg: noSpeechSampling, telegram })

/** Writes a real English sidecar and records its scan row; `row` overrides the verdict, evidence, or stored stat. */
const englishSidecar = (name: string, row: Partial<SubtitleScanRecord> = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped()
    const filePath = `${directory}/${name}.en.srt`
    yield* fs.writeFileString(filePath, '1\n')
    const info = yield* fs.stat(filePath)
    const scannedAt = yield* DateTime.nowAsDate
    yield* provideTest(
      recordScan({
        evidence: 'audio',
        fileMtime: info.mtime._tag === 'Some' ? info.mtime.value : null,
        filePath,
        fileSize: Number(info.size),
        scanVersion: SUBTITLE_SCAN_VERSION,
        scannedAt,
        verdict: 'passed',
        ...row,
      })
    )
    return { forced: false, hi: false, language: 'en' as const, path: filePath }
  })

const clean = () =>
  Effect.gen(function* () {
    yield* Effect.promise(() => testSql`DELETE FROM french_profiles`)
    yield* Effect.promise(() => testSql`DELETE FROM missing_subtitles`)
    yield* Effect.promise(() => testSql`DELETE FROM subtitle_scans`)
  })

beforeEach(() => Effect.runPromise(clean()))

const french = { forced: false, hi: false, language: 'fr' as const, path: '/library/movie.fr.srt' }
const frenchRow = (subtitles: Movie['subtitles']) => item({ missingSubtitles: [{ forced: false, language: 'fr' }], subtitles })
const unqualified: [string, (name: string) => ReturnType<typeof englishSidecar>][] = [
  [
    'no registry row',
    (name) =>
      englishSidecar(name).pipe(Effect.tap((sidecar) => Effect.promise(() => testSql`DELETE FROM subtitle_scans WHERE file_path = ${sidecar.path}`))),
  ],
  ['evidence reference', (name) => englishSidecar(name, { evidence: 'reference' })],
  ['an inconclusive verdict', (name) => englishSidecar(name, { evidence: null, verdict: 'inconclusive' })],
  ['an older scan version', (name) => englishSidecar(name, { scanVersion: SUBTITLE_SCAN_VERSION - 1 })],
  ['a stale stored stat', (name) => englishSidecar(name, { fileSize: 1 })],
  ['no stored stat', (name) => englishSidecar(name, { fileMtime: null, fileSize: null })],
]

describe('applyMissingPolicy', () => {
  it.effect('uses strict virtual clocks, skips forced records, and uses the first non-forced source', () =>
    Effect.gen(function* () {
      const source = { forced: false, hi: true, language: 'es' as const, path: '/library/movie.es.srt' }
      const forced = { forced: true, hi: false, language: 'fr' as const, path: '/library/movie.fr.forced.srt' }
      const english = yield* englishSidecar('movie')
      const test = yield* service([
        item({
          missingSubtitles: [
            { forced: false, language: 'en' },
            { forced: false, language: 'fr' },
            { forced: true, language: 'de' },
          ],
          subtitles: [forced, source, english],
        }),
      ])

      yield* run(test.bazarr, test.telegram)
      yield* TestClock.adjust(3 * DAY)
      yield* run(test.bazarr, test.telegram)
      expect(yield* Ref.get(test.translations)).toEqual([])

      yield* TestClock.adjust(1)
      yield* run(test.bazarr, test.telegram)
      expect(yield* Ref.get(test.translations)).toEqual([
        { item: expect.objectContaining({ id: 1, kind: 'movie' }), source, target: 'en' },
        { item: expect.objectContaining({ id: 1, kind: 'movie' }), source: english, target: 'fr' },
      ])
      expect((yield* provideTest(listMissing)).find((row) => row.language === 'de')).toBeUndefined()
      yield* run(test.bazarr, test.telegram)
      expect(yield* Ref.get(test.translations)).toHaveLength(2)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.effect('does not translate when only forced subtitle references exist', () =>
    Effect.gen(function* () {
      const test = yield* service([item({ subtitles: [{ forced: true, hi: false, language: 'es', path: '/library/movie.es.forced.srt' }] })])
      yield* run(test.bazarr, test.telegram)
      yield* TestClock.adjust(3 * DAY + 1)
      yield* run(test.bazarr, test.telegram)
      expect(yield* Ref.get(test.translations)).toEqual([])
      expect(yield* Ref.get(test.messages)).toEqual(['No subtitles for Movie after 3 days (missing: en)'])
    })
  )

  it.effect('groups younger unacted languages, retries a failed alert, and continues another item', () =>
    Effect.gen(function* () {
      const messages = yield* Ref.make<string[]>([])
      const translations = yield* Ref.make<Translation[]>([])
      const allMissing = item()
      const english = yield* englishSidecar('other')
      const translatable = item({
        id: 2,
        missingSubtitles: [{ forced: false, language: 'de' }],
        subtitles: [{ forced: false, hi: false, language: 'es', path: '/library/other.es.srt' }, english],
        title: 'Other',
      })
      const bazarr = new WantedBazarr([allMissing, translatable], (translatedItem, source, target) =>
        Ref.update(translations, (calls) => [...calls, { item: translatedItem, source, target }])
      )
      const failingTelegram = new RecordingTelegram(() => Effect.fail(networkError()))
      yield* run(bazarr, failingTelegram)
      yield* TestClock.adjust(2 * DAY)
      allMissing.missingSubtitles.push({ forced: false, language: 'fr' })
      yield* run(bazarr, failingTelegram)
      yield* TestClock.adjust(DAY + 1)
      yield* run(bazarr, failingTelegram)
      expect(yield* Ref.get(translations)).toEqual([expect.objectContaining({ item: expect.objectContaining({ id: 2 }), target: 'de' })])
      expect((yield* provideTest(listMissing)).find((row) => row.bazarrId === 1)?.actedAt).toBeNull()

      const succeedingTelegram = new RecordingTelegram((_chatId, text) => Ref.update(messages, (texts) => [...texts, text]).pipe(Effect.as(1)))
      yield* run(bazarr, succeedingTelegram)
      expect(yield* Ref.get(messages)).toEqual(['No subtitles for Movie after 3 days (missing: en, fr)'])
      expect((yield* provideTest(listMissing)).filter((row) => row.bazarrId === 1).every((row) => row.actedAt !== null)).toBe(true)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.effect('retries a failed episode translation without repeating its successful sibling language', () =>
    Effect.gen(function* () {
      const english = yield* englishSidecar('episode')
      const episode: BazarrItem = {
        ...item({
          missingSubtitles: [
            { forced: false, language: 'en' },
            { forced: false, language: 'fr' },
          ],
          subtitles: [{ forced: false, hi: false, language: 'es', path: '/library/episode.es.srt' }, english],
        }),
        kind: 'episode',
        seriesId: 3,
      }
      const successful = yield* Ref.make<string[]>([])
      const failing = new WantedBazarr(
        [],
        (_item, _source, target) => (target === 'en' ? Effect.fail(networkError()) : Ref.update(successful, (languages) => [...languages, target])),
        [episode]
      )
      const telegram = new MockTelegramClient()
      yield* run(failing, telegram)
      yield* TestClock.adjust(3 * DAY + 1)
      yield* run(failing, telegram)
      expect(yield* Ref.get(successful)).toEqual(['fr'])
      const rows = yield* provideTest(listMissing)
      expect(rows.find((row) => row.language === 'en')?.actedAt).toBeNull()
      expect(rows.find((row) => row.language === 'fr')?.actedAt).not.toBeNull()
      expect(rows.every((row) => row.bazarrKind === 'episode')).toBeTrue()

      const retry = yield* service([], [episode])
      yield* run(retry.bazarr, retry.telegram)
      yield* run(retry.bazarr, retry.telegram)
      expect(yield* Ref.get(retry.translations)).toEqual([{ item: episode, source: episode.subtitles[0], target: 'en' }])
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.effect('limits translation requests to three per pass, including failures, without delaying alerts', () =>
    Effect.gen(function* () {
      const source = { forced: false, hi: false, language: 'es' as const, path: '/library/source.es.srt' }
      const movies = [1, 2, 3].map((id) => item({ id, subtitles: [source] }))
      const episode: BazarrItem = { ...item({ id: 4, subtitles: [source] }), kind: 'episode', seriesId: 5 }
      const attempts = yield* Ref.make<BazarrItemRef[]>([])
      const messages = yield* Ref.make<string[]>([])
      const bazarr = new WantedBazarr(
        [...movies, item({ id: 5, title: 'Unsubtitled' })],
        (translatedItem) =>
          Ref.updateAndGet(attempts, (items) => [...items, translatedItem]).pipe(
            Effect.flatMap((items) => (items.length === 1 ? Effect.fail(networkError()) : Effect.void))
          ),
        [episode]
      )
      const telegram = new RecordingTelegram((_chatId, text) => Ref.update(messages, (texts) => [...texts, text]).pipe(Effect.as(1)))
      yield* run(bazarr, telegram)
      yield* TestClock.adjust(3 * DAY + 1)
      yield* run(bazarr, telegram)
      expect(yield* Ref.get(attempts)).toHaveLength(3)
      expect(yield* Ref.get(messages)).toEqual(['No subtitles for Unsubtitled after 3 days (missing: en)'])
      expect((yield* provideTest(listMissing)).filter((row) => row.bazarrId !== 5 && row.actedAt === null)).toHaveLength(2)

      yield* run(bazarr, telegram)
      expect(yield* Ref.get(attempts)).toHaveLength(5)
      expect(new Set((yield* Ref.get(attempts)).map((ref) => `${ref.kind}:${ref.id}`)).size).toBe(4)
      expect((yield* provideTest(listMissing)).every((row) => row.actedAt !== null)).toBe(true)
      expect(yield* Ref.get(messages)).toHaveLength(1)
    })
  )

  it.effect('resets the clock after disappearance and reappearance', () =>
    Effect.gen(function* () {
      const initial = yield* service([item()])
      yield* run(initial.bazarr, initial.telegram)
      const absent = yield* service([])
      yield* run(absent.bazarr, absent.telegram)
      expect(yield* provideTest(listMissing)).toEqual([])

      const reappeared = yield* service([item({ subtitles: [{ forced: false, hi: false, language: 'es', path: '/library/movie.es.srt' }] })])
      yield* run(reappeared.bazarr, reappeared.telegram)
      yield* TestClock.adjust(3 * DAY)
      yield* run(reappeared.bazarr, reappeared.telegram)
      expect(yield* Ref.get(reappeared.translations)).toEqual([])
      yield* TestClock.adjust(1)
      yield* run(reappeared.bazarr, reappeared.telegram)
      expect(yield* Ref.get(reappeared.translations)).toHaveLength(1)
    })
  )

  it.effect('keeps an action eligible when its database marker fails', () =>
    Effect.gen(function* () {
      const test = yield* service([item({ subtitles: [{ forced: false, hi: false, language: 'es', path: '/library/movie.es.srt' }] })])
      yield* run(test.bazarr, test.telegram)
      yield* TestClock.adjust(3 * DAY + 1)
      const restore = failNextStatement('UPDATE', new Error('database unavailable'))
      yield* run(test.bazarr, test.telegram).pipe(Effect.ensuring(Effect.sync(restore)))
      expect((yield* provideTest(listMissing))[0]?.actedAt).toBeNull()
      yield* run(test.bazarr, test.telegram)
      expect(yield* Ref.get(test.translations)).toHaveLength(2)
    })
  )

  it.effect('propagates interruption from an action', () =>
    Effect.gen(function* () {
      const interrupted = new WantedBazarr(
        [item({ subtitles: [{ forced: false, hi: false, language: 'es', path: '/library/movie.es.srt' }] })],
        () => Effect.interrupt
      )
      const telegram = new MockTelegramClient()
      yield* run(interrupted, telegram)
      yield* TestClock.adjust(3 * DAY + 1)
      const exit = yield* Effect.exit(run(interrupted, telegram))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
    })
  )

  it.effect('deduplicates wanted keys and leaves state intact when a complete snapshot fails', () =>
    Effect.gen(function* () {
      const duplicate = item()
      const test = yield* service([duplicate, duplicate])
      yield* run(test.bazarr, test.telegram)
      expect(yield* provideTest(listMissing)).toHaveLength(1)

      const failed = new WantedBazarr([], () => Effect.void)
      Object.defineProperty(failed, 'getWantedEpisodes', { get: () => Effect.fail(networkError()) })
      yield* Effect.ignore(run(failed, test.telegram))
      expect(yield* provideTest(listMissing)).toHaveLength(1)
    })
  )

  describe('translation source', () => {
    for (const [reason, make] of unqualified) {
      it.effect(`[VC-21] leaves a due French row unacted without translating or sampling speech when the English sidecar has ${reason}`, () =>
        Effect.gen(function* () {
          const english = yield* make('movie')
          const test = yield* service([frenchRow([english])])
          yield* run(test.bazarr, test.telegram)
          yield* TestClock.adjust(3 * DAY + 1)
          yield* run(test.bazarr, test.telegram)
          yield* run(test.bazarr, test.telegram)
          expect(yield* Ref.get(test.translations)).toEqual([])
          expect(yield* Ref.get(test.messages)).toEqual([])
          expect((yield* provideTest(listMissing)).map((row) => row.actedAt)).toEqual([null])
        }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
      )
    }

    it.effect('[VC-21] translates a waiting French row on a later pass, from the smallest qualifying English path', () =>
      Effect.gen(function* () {
        const waiting = yield* englishSidecar('movie', { evidence: 'reference' })
        const test = yield* service([frenchRow([waiting])])
        yield* run(test.bazarr, test.telegram)
        yield* TestClock.adjust(3 * DAY + 1)
        yield* run(test.bazarr, test.telegram)
        expect(yield* Ref.get(test.translations)).toEqual([])

        const first = yield* englishSidecar('one')
        const second = yield* englishSidecar('two')
        const [smallest] = [first, second].toSorted((left, right) => (left.path < right.path ? -1 : 1))
        const later = yield* service([frenchRow([waiting, second, first])])
        yield* run(later.bazarr, later.telegram)
        expect(yield* Ref.get(later.translations)).toEqual([expect.objectContaining({ source: smallest, target: 'fr' })])
        expect((yield* provideTest(listMissing)).map((row) => row.actedAt)).not.toContain(null)
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
    )

    it.effect('[VC-21] translates a due English row from the French sidecar without a registry requirement', () =>
      Effect.gen(function* () {
        const test = yield* service([item({ subtitles: [french] })])
        yield* run(test.bazarr, test.telegram)
        yield* TestClock.adjust(3 * DAY + 1)
        yield* run(test.bazarr, test.telegram)
        expect(yield* Ref.get(test.translations)).toEqual([expect.objectContaining({ source: french, target: 'en' })])
      })
    )

    it.effect('[VC-21] keeps the cap of three translations per pass when waiting rows are skipped', () =>
      Effect.gen(function* () {
        const english = yield* englishSidecar('movie')
        const waiting = yield* englishSidecar('waiting', { evidence: 'reference' })
        const movies = [1, 2, 3, 4, 5].map((id) => ({ ...frenchRow([id === 1 ? waiting : english]), id }))
        const test = yield* service(movies)
        yield* run(test.bazarr, test.telegram)
        yield* TestClock.adjust(3 * DAY + 1)
        yield* run(test.bazarr, test.telegram)
        expect((yield* Ref.get(test.translations)).map((call) => call.item.id)).toEqual([2, 3, 4])
        expect(
          (yield* provideTest(listMissing))
            .filter((row) => row.actedAt === null)
            .map((row) => row.bazarrId)
            .toSorted((left, right) => left - right)
        ).toEqual([1, 5])
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
    )
  })
})
