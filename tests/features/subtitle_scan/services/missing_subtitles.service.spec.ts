import { beforeEach, spyOn } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockBazarrClient, MockTelegramClient } from '@tests/utils'
import { Cause, Effect, Exit, Ref } from 'effect'
import { TestClock } from 'effect/testing'

import { frenchProfiles, missingSubtitles, subtitleScans } from '@/database/schema'
import { listMissing } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { applyMissingPolicy } from '@/features/subtitle_scan/services/missing_subtitles.service'
import { type BazarrItem, type BazarrItemRef, type BazarrSubtitleRef, type IBazarrClient } from '@/integrations/bazarr/bazarr.service'
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

const networkError = () => new NetworkError({ cause: 'unavailable', originalMessage: 'unavailable', serviceName: 'BazarrTest' })
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

const run = (bazarr: IBazarrClient, telegram: ITelegramClient) => provideTest(applyMissingPolicy, { bazarr, telegram })
const clean = () =>
  Effect.gen(function* () {
    yield* Effect.promise(() => db.delete(frenchProfiles))
    yield* Effect.promise(() => db.delete(missingSubtitles))
    yield* Effect.promise(() => db.delete(subtitleScans))
  })

beforeEach(() => Effect.runPromise(clean()))

describe('applyMissingPolicy', () => {
  it.effect('uses strict virtual clocks, skips forced records, and uses the first non-forced source', () =>
    Effect.gen(function* () {
      const source = { forced: false, hi: true, language: 'es' as const, path: '/library/movie.es.srt' }
      const forced = { forced: true, hi: false, language: 'fr' as const, path: '/library/movie.fr.forced.srt' }
      const test = yield* service([
        item({
          missingSubtitles: [
            { forced: false, language: 'en' },
            { forced: false, language: 'fr' },
            { forced: true, language: 'de' },
          ],
          subtitles: [forced, source],
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
        { item: expect.objectContaining({ id: 1, kind: 'movie' }), source, target: 'fr' },
      ])
      expect((yield* provideTest(listMissing)).find((row) => row.language === 'de')).toBeUndefined()
      yield* run(test.bazarr, test.telegram)
      expect(yield* Ref.get(test.translations)).toHaveLength(2)
    })
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
      const translatable = item({
        id: 2,
        missingSubtitles: [{ forced: false, language: 'de' }],
        subtitles: [{ forced: false, hi: false, language: 'es', path: '/library/other.es.srt' }],
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
    })
  )

  it.effect('retries a failed episode translation without repeating its successful sibling language', () =>
    Effect.gen(function* () {
      const episode: BazarrItem = {
        ...item({
          missingSubtitles: [
            { forced: false, language: 'en' },
            { forced: false, language: 'fr' },
          ],
          subtitles: [{ forced: false, hi: false, language: 'es', path: '/library/episode.es.srt' }],
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
      const update = spyOn(db, 'update').mockImplementationOnce(() => {
        throw new Error('database unavailable')
      })
      yield* run(test.bazarr, test.telegram).pipe(Effect.ensuring(Effect.sync(() => update.mockRestore())))
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
})
