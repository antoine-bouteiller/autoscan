import { makeTestContext, provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { plexMetadata } from '@tests/resources/fixtures/plex.fixtures'
import { MockBazarrClient, MockTmdbClient } from '@tests/utils'
import { Context, Deferred, Effect, Fiber, FileSystem } from 'effect'

import { BackgroundTasks, Bazarr, Ffmpeg, Plex, SubtitleScan, Tmdb } from '@/core/runtime.service'
import { runSubtitleScan, startSubtitleScan } from '@/features/subtitle_scan/jobs/subtitle_scan.job'
import { type BazarrItem } from '@/integrations/bazarr/bazarr.service'
import { type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type PlexMedia } from '@/integrations/plex/plex.validator'
import { NetworkError } from '@/shared/errors/network'

const ffmpeg: IFfmpegClient = {
  execute: () => Effect.succeed(''),
  executeFfmpeg: () => Effect.succeed(''),
  ffprobe: () => Effect.succeed({ duration: 100, streams: [] }),
}

const makeCountingFfmpeg = () => {
  let probes = 0
  return {
    client: {
      ...ffmpeg,
      ffprobe: () =>
        Effect.sync(() => {
          probes++
        }).pipe(Effect.as({ duration: 100, streams: [] })),
    },
    probes: () => probes,
  }
}

class BlockingPlexClient extends MockPlexClient {
  private readonly entered: Deferred.Deferred<void>
  private readonly release: Deferred.Deferred<void>

  constructor(release: Deferred.Deferred<void>, entered: Deferred.Deferred<void>) {
    super()
    this.release = release
    this.entered = entered
  }

  override get getSections() {
    const { entered, release } = this
    return Effect.gen(function* () {
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(release)
      return []
    })
  }
}

interface TraversalPlexClient extends IPlexClient {
  readonly sectionCalls: number[]
}

const makeTraversalPlex = (file: string): TraversalPlexClient => {
  const [template] = [plexMetadata[123]]
  if (template === undefined) {
    throw new Error('Missing Plex fixture')
  }
  const metadata: PlexMedia = {
    ...template,
    Media: template.Media.map((media) => ({ ...media, Part: media.Part.map((part) => ({ ...part, file })) })),
  }
  const sectionCalls: number[] = []
  const client = new MockPlexClient()
  Object.defineProperties(client, {
    getPlexMetadata: { value: () => Effect.succeed(metadata) },
    getSectionMedia: {
      value: (id: number) => {
        sectionCalls.push(id)
        return id === 1
          ? Effect.fail(new NetworkError({ cause: 'unavailable', originalMessage: 'unavailable', serviceName: 'PlexTest' }))
          : Effect.succeed([metadata])
      },
    },
    getSections: {
      value: Effect.succeed([
        { key: 1, title: 'Broken', type: 'movie' as const },
        { key: 2, title: 'Movies', type: 'movie' as const },
      ]),
    },
  })
  return Object.assign(client, { sectionCalls })
}

class FailingTopLevelPlexClient extends MockPlexClient {
  override get getSections() {
    return Effect.die('Plex unavailable')
  }
}

const makeTypedFailingTopLevelPlex = (): IPlexClient => {
  const client = new MockPlexClient()
  Object.defineProperty(client, 'getSections', {
    value: Effect.fail(new NetworkError({ cause: 'unavailable', originalMessage: 'unavailable', serviceName: 'PlexTest' })),
  })
  return client
}

type FrenchProfileLookup = 'failed' | 'missing' | 'present'

class CountingBazarr extends MockBazarrClient {
  lookups = 0
  profiles = 0
  wantedEpisodes = 0
  wantedMovies = 0
  profileWrites = 0

  private readonly frenchProfileLookup: FrenchProfileLookup
  private readonly item: BazarrItem

  constructor(item: BazarrItem, frenchProfileLookup: FrenchProfileLookup = 'present') {
    super()
    this.item = item
    this.frenchProfileLookup = frenchProfileLookup
  }

  override getMovieByPath() {
    return Effect.sync(() => {
      this.lookups++
    }).pipe(Effect.as(this.item))
  }

  override get getProfiles() {
    return Effect.sync(() => {
      this.profiles++
    }).pipe(
      Effect.flatMap(() => {
        if (this.frenchProfileLookup === 'failed') {
          return Effect.fail(new NetworkError({ cause: 'unavailable', originalMessage: 'unavailable', serviceName: 'BazarrTest' }))
        }
        return Effect.succeed(this.frenchProfileLookup === 'missing' ? [] : [{ name: 'French forced', profileId: 7 }])
      })
    )
  }

  override get getWantedEpisodes() {
    return Effect.sync(() => {
      this.wantedEpisodes++
    }).pipe(Effect.as([]))
  }

  override get getWantedMovies() {
    return Effect.sync(() => {
      this.wantedMovies++
    }).pipe(Effect.as([]))
  }

  override setProfile() {
    return Effect.sync(() => {
      this.profileWrites++
    }).pipe(Effect.as(undefined))
  }
}

describe('subtitle scan job', () => {
  it.live('does not queue simultaneous manual or scheduled scans', () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<void>()
      const result = yield* provideTest(
        Effect.gen(function* () {
          const first = yield* startSubtitleScan
          const second = yield* startSubtitleScan
          yield* runSubtitleScan
          yield* Deferred.succeed(release, undefined)
          const tasks = yield* BackgroundTasks
          yield* tasks.awaitEmpty
          const afterCompletion = yield* startSubtitleScan
          yield* tasks.awaitEmpty
          return { afterCompletion, first, second }
        }),
        { plex: new BlockingPlexClient(release, entered) }
      )
      expect(result).toEqual({ afterCompletion: true, first: true, second: false })
    })
  )

  it.live('releases a reservation when managed background submission is refused', () =>
    Effect.gen(function* () {
      const result = yield* provideTest(
        Effect.gen(function* () {
          const tasks = yield* BackgroundTasks
          yield* tasks.stopIntake
          const accepted = yield* startSubtitleScan
          const gate = yield* SubtitleScan
          const available = yield* gate.takeIfAvailable(1)
          if (available) {
            yield* gate.release(1)
          }
          return { accepted, available }
        })
      )
      expect(result).toEqual({ accepted: false, available: true })
    })
  )

  it.live('releases a manual reservation when managed shutdown interrupts its work', () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<void>()
      const result = yield* provideTest(
        Effect.gen(function* () {
          const tasks = yield* BackgroundTasks
          const accepted = yield* Effect.uninterruptible(startSubtitleScan)
          yield* Effect.yieldNow
          yield* Deferred.await(entered)
          yield* tasks.clear
          yield* tasks.awaitEmpty
          const gate = yield* SubtitleScan
          const available = yield* gate.takeIfAvailable(1)
          if (available) {
            yield* gate.release(1)
          }
          return { accepted, available }
        }),
        { plex: new BlockingPlexClient(release, entered) }
      )
      expect(result).toEqual({ accepted: true, available: true })
    })
  )

  it.live('releases scheduled admission after interruption without reconciling missing subtitles', () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<void>()
      const bazarr = new CountingBazarr({ id: 1, kind: 'movie', missingSubtitles: [], path: '', subtitles: [], title: '' })
      const result = yield* provideTest(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(runSubtitleScan)
          yield* Effect.yieldNow
          yield* Deferred.await(entered)
          yield* Fiber.interrupt(fiber)
          const gate = yield* SubtitleScan
          const available = yield* gate.takeIfAvailable(1)
          if (available) {
            yield* gate.release(1)
          }
          return available
        }),
        { bazarr, plex: new BlockingPlexClient(release, entered) }
      )
      expect(result).toBeTrue()
      expect(bazarr).toMatchObject({ wantedEpisodes: 0, wantedMovies: 0 })
    })
  )

  it.scoped('continues after a failed section and shares one lazy lookup between analysis and French policy', () =>
    Effect.gen(function* () {
      const context = yield* makeTestContext()
      const fs = Context.get(context, FileSystem.FileSystem)
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie {tmdb-99991}.mkv`
      const subtitle = `${directory}/Movie {tmdb-99991}.en.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(subtitle, '1\n00:00:00,000 --> 00:00:02,000\nsubtitle')
      const item: BazarrItem = {
        id: 99_991,
        kind: 'movie',
        missingSubtitles: [],
        path: file,
        subtitles: [{ forced: false, hi: false, language: 'en', path: subtitle }],
        title: 'Movie',
      }
      const plex = makeTraversalPlex(file)
      const bazarr = new CountingBazarr(item)
      const tmdb = new MockTmdbClient()
      tmdb.mediaMap.set('99991-movie', { data: { original_language: 'fr', title: 'Movie' }, type: 'movie' })
      const overridden = Context.add(
        Context.add(Context.add(Context.add(Context.add(context, Bazarr, bazarr), Ffmpeg, ffmpeg), Plex, plex), Tmdb, tmdb),
        SubtitleScan,
        Context.get(context, SubtitleScan)
      )
      yield* runSubtitleScan.pipe(Effect.provide(overridden))
      expect(plex.sectionCalls).toEqual([1, 2])
      expect(bazarr).toMatchObject({ lookups: 1, profileWrites: 1, profiles: 1, wantedEpisodes: 1, wantedMovies: 1 })
    })
  )

  it.scoped('disables only French policy when its preset is missing or lookup fails', () =>
    Effect.gen(function* () {
      const context = yield* makeTestContext()
      const fs = Context.get(context, FileSystem.FileSystem)
      const results: { bazarr: CountingBazarr; probes: number }[] = []
      const frenchProfileLookups: readonly FrenchProfileLookup[] = ['missing', 'failed']
      for (const [index, frenchProfileLookup] of frenchProfileLookups.entries()) {
        const id = 99_992 + index
        const directory = yield* fs.makeTempDirectoryScoped()
        const file = `${directory}/Movie {tmdb-${id}}.mkv`
        const subtitle = `${directory}/Movie {tmdb-${id}}.en.srt`
        yield* fs.writeFileString(file, '')
        yield* fs.writeFileString(subtitle, `1\n00:00:00,000 --> 00:00:02,000\nsubtitle ${frenchProfileLookup}`)
        const item: BazarrItem = {
          id,
          kind: 'movie',
          missingSubtitles: [],
          path: file,
          subtitles: [{ forced: false, hi: false, language: 'en', path: subtitle }],
          title: 'Movie',
        }
        const bazarr = new CountingBazarr(item, frenchProfileLookup)
        const tmdb = new MockTmdbClient()
        tmdb.mediaMap.set(`${id}-movie`, { data: { original_language: 'fr', title: 'Movie' }, type: 'movie' })
        const countedFfmpeg = makeCountingFfmpeg()
        const overridden = Context.add(
          Context.add(
            Context.add(Context.add(Context.add(context, Bazarr, bazarr), Ffmpeg, countedFfmpeg.client), Plex, makeTraversalPlex(file)),
            Tmdb,
            tmdb
          ),
          SubtitleScan,
          Context.get(context, SubtitleScan)
        )
        yield* runSubtitleScan.pipe(Effect.provide(overridden))
        results.push({ bazarr, probes: countedFfmpeg.probes() })
      }
      for (const { bazarr, probes } of results) {
        expect(probes).toBe(1)
        expect(bazarr).toMatchObject({ lookups: 1, profileWrites: 0, profiles: 1, wantedEpisodes: 1, wantedMovies: 1 })
      }
    })
  )

  it.live('runs missing-subtitle reconciliation once when the top-level Plex read fails', () =>
    Effect.gen(function* () {
      const bazarr = new CountingBazarr({ id: 1, kind: 'movie', missingSubtitles: [], path: '', subtitles: [], title: '' })
      yield* provideTest(runSubtitleScan, { bazarr, plex: new FailingTopLevelPlexClient() })
      expect(bazarr).toMatchObject({ wantedEpisodes: 1, wantedMovies: 1 })
    })
  )

  it.live('releases manual admission after typed failures and defects, allowing a follow-up scan', () =>
    Effect.gen(function* () {
      const results = yield* Effect.forEach([makeTypedFailingTopLevelPlex(), new FailingTopLevelPlexClient()], (plex) =>
        provideTest(
          Effect.gen(function* () {
            const tasks = yield* BackgroundTasks
            const accepted = yield* startSubtitleScan
            yield* tasks.awaitEmpty
            const gate = yield* SubtitleScan
            const availableAfterFailure = yield* gate.takeIfAvailable(1)
            if (availableAfterFailure) {
              yield* gate.release(1)
            }
            const followup = yield* startSubtitleScan
            yield* tasks.awaitEmpty
            const availableAfterFollowup = yield* gate.takeIfAvailable(1)
            if (availableAfterFollowup) {
              yield* gate.release(1)
            }
            return { accepted, availableAfterFailure, availableAfterFollowup, followup }
          }),
          { plex }
        )
      )
      expect(results).toEqual([
        { accepted: true, availableAfterFailure: true, availableAfterFollowup: true, followup: true },
        { accepted: true, availableAfterFailure: true, availableAfterFollowup: true, followup: true },
      ])
    })
  )

  it.scoped('releases a reservation when background submission defects', () =>
    Effect.gen(function* () {
      const context = yield* makeTestContext()
      const defectiveTasks = BackgroundTasks.of({
        awaitEmpty: Effect.void,
        clear: Effect.void,
        start: () => Effect.die('submission failed'),
        stopIntake: Effect.void,
      })
      const overridden = Context.add(context, BackgroundTasks, defectiveTasks)
      const result = yield* Effect.gen(function* () {
        const submission = yield* Effect.exit(startSubtitleScan)
        const gate = yield* SubtitleScan
        const available = yield* gate.takeIfAvailable(1)
        if (available) {
          yield* gate.release(1)
        }
        return { available, failed: submission._tag === 'Failure' }
      }).pipe(Effect.provide(overridden))
      expect(result).toEqual({ available: true, failed: true })
    })
  )
})
