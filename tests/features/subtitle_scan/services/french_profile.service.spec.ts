/* oxlint-disable unicorn/no-null -- Bazarr profile clearing and nullable database state are part of the contract. */
import { beforeEach, spyOn } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockBazarrClient, setProfileMock } from '@tests/mocks/bazarr.mock'
import { DateTime, Effect, Exit, FileSystem, PlatformError } from 'effect'
import { TestClock } from 'effect/testing'

import { frenchProfiles } from '@/database/schema'
import { getFrenchProfile, insertFrenchProfile } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { applyFrenchProfilePolicy } from '@/features/subtitle_scan/services/french_profile.service'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem } from '@/integrations/bazarr/bazarr.service'

const movie = {
  id: 42,
  kind: 'movie',
  missingSubtitles: [],
  path: '/library/Movie.with.dots.mkv',
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

  it.effect('does not look up episodes, non-French-preferred movies, or a disabled preset', () =>
    provideTest(
      Effect.gen(function* () {
        const lookup = Effect.die('ineligible lookup')
        yield* applyFrenchProfilePolicy({ ...details, mediaType: 'show' }, lookup, 7)
        yield* applyFrenchProfilePolicy({ ...details, preferredLanguage: 'en' }, lookup, 7)
        yield* applyFrenchProfilePolicy(details, lookup, undefined)
        expect(setProfileMock).not.toHaveBeenCalled()
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
