/* oxlint-disable unicorn/no-null -- Bazarr profile clearing and nullable database state are part of the contract. */
import { beforeEach, spyOn } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockBazarrClient, setProfileMock } from '@tests/mocks/bazarr.mock'
import { DateTime, Effect, Exit, FileSystem, PlatformError } from 'effect'
import { TestClock } from 'effect/testing'

import { Bazarr } from '@/core/runtime.service'
import { frenchProfiles } from '@/database/schema'
import { getFrenchProfile, insertFrenchProfile } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { applyFrenchProfilePolicy } from '@/features/subtitle_scan/services/french_profile.service'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem, type BazarrItemRef, type BazarrSubtitleRef } from '@/integrations/bazarr/bazarr.service'

const movie = {
  id: 42,
  kind: 'movie',
  missingSubtitles: [],
  path: `${process.cwd()}/Movie.with.dots.mkv`,
  subtitles: [],
  title: 'Movie',
} satisfies BazarrItem
const details: SubtitleScanMedia = { file: movie.path, mediaTitle: movie.title, mediaType: 'movie', preferredLanguage: 'fr' }
const apply = applyFrenchProfilePolicy(details, Effect.succeed(movie), 7)
const week = 7 * 86_400_000

const assign = Effect.gen(function* () {
  yield* insertFrenchProfile({ assignedAt: yield* DateTime.nowAsDate, bazarrId: movie.id, bazarrKind: movie.kind })
})

describe('French movie profile policy', () => {
  beforeEach(() =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.promise(() => db.delete(frenchProfiles))
        setProfileMock.mockReset().mockResolvedValue(undefined)
      })
    )
  )

  it.effect('assigns the French-preferred movie once, independent of its original language', () =>
    Effect.gen(function* () {
      yield* provideTest(apply)
      yield* TestClock.adjust(week)
      yield* provideTest(apply)
      expect(setProfileMock.mock.calls).toEqual([[movie, 7]])
      expect(yield* provideTest(getFrenchProfile(movie))).toMatchObject({ releasedAt: null })
    })
  )

  it.effect('does not look up episodes or non-French-preferred movies', () =>
    provideTest(
      Effect.gen(function* () {
        const lookup = Effect.die('ineligible lookup')
        yield* applyFrenchProfilePolicy({ ...details, mediaType: 'show' }, lookup, 7)
        yield* applyFrenchProfilePolicy({ ...details, preferredLanguage: 'en' }, lookup, 7)
        expect(setProfileMock).not.toHaveBeenCalled()
      })
    )
  )

  it.effect('cleans only exact Bazarr-matched non-forced sidecars on assignment and later passes', () =>
    provideTest(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const directory = yield* fs.makeTempDirectoryScoped()
        const file = `${directory}/Movie.with.dots.mkv`
        const english = `${directory}/Movie.with.dots.en.srt`
        const french = `${directory}/Movie.with.dots.fr.srt`
        const forced = `${directory}/Movie.with.dots.fr.forced.srt`
        const unrelated = `${directory}/Other.en.srt`
        const unmatched = `${directory}/Movie.with.dots.it.srt`
        const markedForced = `${directory}/Movie.with.dots.es.srt`
        yield* Effect.forEach([english, french, forced, unrelated, unmatched, markedForced], (path) => fs.writeFileString(path, 'subtitle'))
        const subtitles: BazarrSubtitleRef[] = [
          { forced: false, hi: false, language: 'en', path: english },
          { forced: false, hi: false, language: 'fr', path: french },
          { forced: true, hi: false, language: 'fr', path: forced },
          { forced: true, hi: false, language: 'es', path: markedForced },
          { forced: false, hi: false, language: 'en', path: unrelated },
          { forced: false, hi: false, language: 'en', path: `${directory}/Movie.with.dots.de.srt` },
        ]
        const item = { ...movie, path: file, subtitles }
        const removed: string[] = []
        const actions: string[] = []
        class TrackingBazarr extends MockBazarrClient {
          override setProfile() {
            return Effect.sync(() => {
              actions.push('profile')
            })
          }
          override deleteSubtitle(_item: BazarrItemRef, subtitle: BazarrSubtitleRef) {
            return Effect.sync(() => {
              actions.push(`delete:${subtitle.path}`)
              removed.push(subtitle.path)
              if (subtitle.path === french && removed.filter((path) => path === french).length === 1) {
                throw new Error('temporary deletion failure')
              }
            })
          }
        }
        const policy = applyFrenchProfilePolicy({ ...details, file }, Effect.succeed(item), 7)
        const tracking = new TrackingBazarr()
        yield* policy.pipe(Effect.provideService(Bazarr, tracking))
        expect(actions).toEqual(['profile', `delete:${english}`, `delete:${french}`])
        expect(yield* getFrenchProfile(item)).toMatchObject({ releasedAt: null })
        yield* policy.pipe(Effect.provideService(Bazarr, tracking))
        expect(removed).toEqual([english, french, english, french])
        expect(yield* fs.exists(forced)).toBeTrue()
        expect(yield* fs.exists(english)).toBeTrue()
        yield* applyFrenchProfilePolicy({ ...details, file }, Effect.succeed(item), undefined).pipe(Effect.provideService(Bazarr, tracking))
        expect(removed).toHaveLength(6)
      })
    )
  )

  it.effect('does not delete before assignment and still cleans a released row without a preset', () =>
    provideTest(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const directory = yield* fs.makeTempDirectoryScoped()
        const file = `${directory}/Movie.with.dots.mkv`
        const subtitle = `${directory}/Movie.with.dots.en.srt`
        yield* fs.writeFileString(subtitle, 'subtitle')
        const item = { ...movie, path: file, subtitles: [{ forced: false, hi: false, language: 'en' as const, path: subtitle }] }
        const deletes: string[] = []
        class TrackingBazarr extends MockBazarrClient {
          override deleteSubtitle(_item: BazarrItemRef, ref: BazarrSubtitleRef) {
            return Effect.sync(() => {
              deletes.push(ref.path)
            })
          }
        }
        const bazarr = new TrackingBazarr()
        const policy = (preset: number | undefined) =>
          applyFrenchProfilePolicy({ ...details, file }, Effect.succeed(item), preset).pipe(Effect.provideService(Bazarr, bazarr))
        yield* policy(undefined)
        expect(deletes).toEqual([])
        expect(yield* getFrenchProfile(item)).toBeUndefined()
        setProfileMock.mockRejectedValueOnce(new Error('assignment failed'))
        expect(Exit.isFailure(yield* Effect.exit(policy(7)))).toBeTrue()
        expect(deletes).toEqual([])
        expect(yield* getFrenchProfile(item)).toBeUndefined()
        yield* assign
        yield* TestClock.adjust(week + 1)
        yield* policy(7)
        expect(deletes).toEqual([subtitle])
        yield* policy(undefined)
        expect(deletes).toEqual([subtitle, subtitle])
        expect((yield* getFrenchProfile(item))?.releasedAt).not.toBeNull()
      })
    )
  )

  it.effect('releases strictly after seven days and never reassigns across rebuilt layers', () =>
    Effect.gen(function* () {
      yield* provideTest(assign)
      yield* TestClock.adjust(week)
      yield* provideTest(apply)
      expect(setProfileMock).not.toHaveBeenCalled()
      yield* TestClock.adjust(1)
      yield* provideTest(apply)
      const released = yield* provideTest(getFrenchProfile(movie))
      expect(released?.releasedAt).not.toBeNull()
      yield* TestClock.adjust(week)
      yield* provideTest(apply)
      expect(setProfileMock.mock.calls).toEqual([[movie, null]])
      expect(yield* provideTest(getFrenchProfile(movie))).toEqual(released)
    })
  )

  it.effect('keeps the profile when the exact French forced sidecar exists', () =>
    provideTest(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const directory = yield* fs.makeTempDirectoryScoped()
        yield* fs.writeFileString(`${directory}/Movie.with.dots.fr.forced.srt`, 'forced subtitle')
        yield* assign
        yield* TestClock.adjust(week + 1)
        yield* applyFrenchProfilePolicy({ ...details, file: `${directory}/Movie.with.dots.mkv` }, Effect.succeed(movie), 7)
        expect(setProfileMock).not.toHaveBeenCalled()
        expect((yield* getFrenchProfile(movie))?.releasedAt).toBeNull()
      })
    )
  )

  it.effect('does not record an unresolved movie or an unexpected episode', () =>
    provideTest(
      Effect.gen(function* () {
        yield* applyFrenchProfilePolicy(details, new MockBazarrClient().getMovieByPath(details.file), 7)
        yield* applyFrenchProfilePolicy(details, Effect.succeed({ ...movie, kind: 'episode', seriesId: 3 }), 7)
        yield* applyFrenchProfilePolicy(details, Effect.succeed({ ...movie, path: '/different/movie.mkv' }), 7)
        expect(yield* getFrenchProfile(movie)).toBeUndefined()
        expect(setProfileMock).not.toHaveBeenCalled()
      })
    )
  )

  it.effect('retries failed assignment and release without advancing lifecycle state', () =>
    provideTest(
      Effect.gen(function* () {
        setProfileMock.mockRejectedValueOnce(new Error('assignment failed'))
        expect(Exit.isFailure(yield* Effect.exit(apply))).toBeTrue()
        expect(yield* getFrenchProfile(movie)).toBeUndefined()
        yield* apply
        yield* TestClock.adjust(week + 1)
        setProfileMock.mockRejectedValueOnce(new Error('release failed'))
        expect(Exit.isFailure(yield* Effect.exit(apply))).toBeTrue()
        expect((yield* getFrenchProfile(movie))?.releasedAt).toBeNull()
        yield* apply
        expect((yield* getFrenchProfile(movie))?.releasedAt).not.toBeNull()
        expect(setProfileMock.mock.calls.map(([, id]) => id)).toEqual([7, 7, null, null])
      })
    )
  )

  it.effect('does not treat a filesystem failure as confirmed absence', () =>
    provideTest(
      Effect.gen(function* () {
        yield* assign
        yield* TestClock.adjust(week + 1)
        const fs = yield* FileSystem.FileSystem
        const exit = yield* Effect.exit(
          apply.pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              exists: () => Effect.fail(PlatformError.badArgument({ description: 'denied', method: 'exists', module: 'FileSystem' })),
            })
          )
        )
        expect(Exit.isFailure(exit)).toBeTrue()
        expect(setProfileMock).not.toHaveBeenCalled()
        expect((yield* getFrenchProfile(movie))?.releasedAt).toBeNull()
      })
    )
  )

  it.effect('leaves assignment eligible when persistence fails after Bazarr success', () =>
    provideTest(
      Effect.gen(function* () {
        const insert = spyOn(db, 'insert').mockImplementationOnce(() => {
          throw new Error('database unavailable')
        })
        const exit = yield* Effect.exit(apply).pipe(Effect.ensuring(Effect.sync(() => insert.mockRestore())))
        expect(Exit.isFailure(exit)).toBeTrue()
        expect(yield* getFrenchProfile(movie)).toBeUndefined()
        yield* apply
        expect(setProfileMock.mock.calls).toEqual([
          [movie, 7],
          [movie, 7],
        ])
      })
    )
  )

  it.effect('leaves release eligible when persistence fails after Bazarr success', () =>
    provideTest(
      Effect.gen(function* () {
        yield* assign
        yield* TestClock.adjust(week + 1)
        const update = spyOn(db, 'update').mockImplementationOnce(() => {
          throw new Error('database unavailable')
        })
        const exit = yield* Effect.exit(apply).pipe(Effect.ensuring(Effect.sync(() => update.mockRestore())))
        expect(Exit.isFailure(exit)).toBeTrue()
        expect((yield* getFrenchProfile(movie))?.releasedAt).toBeNull()
        yield* apply
        expect(setProfileMock.mock.calls).toEqual([
          [movie, null],
          [movie, null],
        ])
      })
    )
  )
})
