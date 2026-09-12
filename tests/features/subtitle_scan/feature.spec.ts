import { beforeEach, describe, expect, test } from 'bun:test'

import { testDatabase as db } from '@tests/database'
import { makeTestContext } from '@tests/effect'
import { it } from '@tests/it'
import { MockBazarrClient, MockPlexClient, MockTelegramClient, MockTmdbClient } from '@tests/utils'
import { Context, Effect, FileSystem, Ref } from 'effect'
import { TestClock } from 'effect/testing'

import { BackgroundTasks } from '@/core/runtime.service'
import { frenchProfiles, media, missingSubtitles, subtitleScans } from '@/database/schema'
import { features } from '@/features/index'
import { subtitleScanCommand } from '@/features/subtitle_scan/commands/subtitle_scan.command'
import { subtitleScanFeature } from '@/features/subtitle_scan/feature'
import { runSubtitleScan } from '@/features/subtitle_scan/jobs/subtitle_scan.job'
import { transcodeCommand } from '@/features/transcoding/commands/transcode.command'
import { transcodingFeature } from '@/features/transcoding/feature'
import { type BazarrItem, type BazarrItemRef, type BazarrSubtitleRef } from '@/integrations/bazarr/bazarr.service'
import { type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type PlexMedia } from '@/integrations/plex/plex.validator'
import { type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'
import { type ISOCode1 } from '@/shared/types/iso_codes'

const DAY = 86_400_000
const cleanSubtitleScanRows = () => Promise.all([db.delete(frenchProfiles), db.delete(media), db.delete(missingSubtitles), db.delete(subtitleScans)])

class AcceptanceBazarr extends MockBazarrClient {
  readonly lookups = new Map<string, number>()
  readonly profileWrites: [BazarrItemRef, number | null][] = []
  readonly syncs: BazarrSubtitleRef[] = []
  readonly translations: string[] = []

  readonly items: Map<string, BazarrItem>
  readonly wantedMovies: BazarrItem[]
  readonly wantedEpisodes: BazarrItem[]

  constructor(items: Map<string, BazarrItem>, wantedMovies: BazarrItem[], wantedEpisodes: BazarrItem[]) {
    super()
    this.items = items
    this.wantedMovies = wantedMovies
    this.wantedEpisodes = wantedEpisodes
  }

  private lookup(path: string) {
    return Effect.sync(() => {
      this.lookups.set(path, (this.lookups.get(path) ?? 0) + 1)
      return this.items.get(path)
    })
  }

  override getMovieByPath(path: string) {
    return this.lookup(path)
  }

  override getEpisodeByPath(path: string) {
    return this.lookup(path)
  }

  override get getProfiles() {
    return Effect.succeed([{ name: 'French forced', profileId: 7 }])
  }

  override get getWantedMovies() {
    return Effect.succeed(this.wantedMovies)
  }

  override get getWantedEpisodes() {
    return Effect.succeed(this.wantedEpisodes)
  }

  override setProfile(item: Extract<BazarrItemRef, { kind: 'movie' }>, profileId: number | null) {
    return Effect.sync(() => {
      this.profileWrites.push([item, profileId])
    })
  }

  override syncSubtitle(_item: BazarrItemRef, subtitle: BazarrSubtitleRef) {
    return Effect.sync(() => {
      this.syncs.push(subtitle)
    })
  }

  override translateSubtitle(_item: BazarrItemRef, _source: BazarrSubtitleRef, target: ISOCode1) {
    return Effect.sync(() => {
      this.translations.push(target)
    })
  }
}

class AcceptancePlex extends MockPlexClient {
  constructor(metadata: Map<number, PlexMedia>) {
    super()
    Object.defineProperties(this, {
      getPlexMetadata: {
        value: (ratingKey: number) => {
          const entry = metadata.get(ratingKey)
          return entry === undefined ? Effect.die(`unknown metadata ${ratingKey}`) : Effect.succeed(entry)
        },
      },
      getSectionMedia: { value: () => Effect.succeed([...metadata.values()]) },
      getSections: { value: Effect.succeed([{ key: 1, title: 'Acceptance', type: 'movie' as const }]) },
    })
  }
}

const subtitle = (starts: readonly number[]) =>
  starts
    .map(
      (start, index) =>
        `${index + 1}\n00:00:${String(start).padStart(2, '0')},000 --> 00:00:${String(start + 4).padStart(2, '0')},000\nline ${index + 1}`
    )
    .join('\n\n')

const metadata = (ratingKey: number, file: string, type: 'movie' | 'episode'): PlexMedia => ({
  Media: [{ Part: [{ Stream: [], file, id: ratingKey }] }],
  key: `/library/metadata/${ratingKey}`,
  librarySectionID: 1,
  primaryExtraKey: `/library/metadata/${ratingKey}`,
  ratingKey: String(ratingKey),
  title: `Item ${ratingKey}`,
  type,
})

describe('subtitle scan feature', () => {
  test('registers one owner for the daily job and command', () => {
    expect(features.filter((feature) => feature === subtitleScanFeature)).toHaveLength(1)
    expect(features.filter((feature) => feature.commands?.['/subtitlescan'] !== undefined)).toEqual([subtitleScanFeature])
    expect(subtitleScanFeature.commands?.['/subtitlescan']).toBe(subtitleScanCommand)
    expect(features.flatMap((feature) => feature.jobs ?? []).filter((job) => job.name === 'Subtitle Scan')).toEqual([
      { handler: runSubtitleScan, name: 'Subtitle Scan', pattern: '0 5 * * *' },
    ])
  })

  test('preserves independent feature registrations', () => {
    expect(features.map((feature) => feature.name)).toEqual([
      'language_sync',
      'plex_auth',
      'queue_cleanup',
      'send_message',
      'subtitle_scan',
      'transcoding',
    ])
    expect(transcodingFeature.commands).toEqual({ '/transcode': transcodeCommand })
    expect(transcodingFeature.jobs?.map((job) => ({ name: job.name, pattern: job.pattern }))).toEqual([
      { name: 'Transcode', pattern: '0 */12 * * *' },
    ])
    expect(transcodingFeature.routes).toHaveLength(2)
  })

  beforeEach(cleanSubtitleScanRows)

  it.scoped('accepts scheduled and manual passes across rebuilt runtimes without reprocessing known subtitle state', () =>
    Effect.gen(function* () {
      const initial = yield* makeTestContext()
      const fs = Context.get(initial, FileSystem.FileSystem)
      const directory = yield* fs.makeTempDirectoryScoped()
      const primaryFile = `${directory}/Primary {tmdb-81001}.mkv`
      const english = `${directory}/Primary {tmdb-81001}.en.srt`
      const french = `${directory}/Primary {tmdb-81001}.fr.srt`
      const episodeFile = `${directory}/Episode {tmdb-81003}.mkv`
      const forcedEpisode = `${directory}/Episode {tmdb-81003}.fr.forced.srt`
      yield* fs.writeFileString(primaryFile, '')
      yield* fs.writeFileString(english, subtitle([0, 20, 40]))
      yield* fs.writeFileString(episodeFile, '')
      yield* fs.writeFileString(forcedEpisode, subtitle([0]))

      const primary: BazarrItem = {
        id: 81_001,
        kind: 'movie',
        missingSubtitles: [{ forced: false, language: 'es' }],
        path: primaryFile,
        subtitles: [{ forced: false, hi: false, language: 'en', path: english }],
        title: 'Primary',
      }
      const frenchMovie: BazarrItem = {
        id: 81_002,
        kind: 'movie',
        missingSubtitles: [],
        path: '/definitely-missing/French {tmdb-81002}.mkv',
        subtitles: [],
        title: 'French movie',
      }
      const episode: BazarrItem = {
        id: 81_003,
        kind: 'episode',
        missingSubtitles: [{ forced: false, language: 'en' }],
        path: episodeFile,
        seriesId: 1,
        subtitles: [{ forced: true, hi: false, language: 'fr', path: forcedEpisode }],
        title: 'Episode',
      }
      const bazarr = new AcceptanceBazarr(
        new Map<string, BazarrItem>([
          [primaryFile, primary],
          [frenchMovie.path, frenchMovie],
          [episodeFile, episode],
        ]),
        [primary],
        [episode]
      )
      const plex = new AcceptancePlex(
        new Map([
          [1, { ...metadata(1, '', 'movie'), Media: [] }],
          [2, metadata(2, primaryFile, 'movie')],
          [3, metadata(3, frenchMovie.path, 'movie')],
          [4, metadata(4, episodeFile, 'episode')],
        ])
      )
      const tmdb = new MockTmdbClient()
      tmdb.mediaMap.set('81001-movie', { data: { original_language: 'en', title: 'Primary' }, type: 'movie' })
      tmdb.mediaMap.set('81002-movie', { data: { original_language: 'fr', title: 'French movie' }, type: 'movie' })
      tmdb.mediaMap.set('81003-show', { data: { name: 'Episode', original_language: 'fr' }, type: 'tv' })
      const probes = yield* Ref.make<string[]>([])
      const ffmpeg: IFfmpegClient = {
        execute: () => Effect.succeed(''),
        executeFfmpeg: () => Effect.succeed(''),
        ffprobe: (file) => Ref.update(probes, (calls) => [...calls, file]).pipe(Effect.as({ duration: 60, streams: [] })),
      }
      const alerts = yield* Ref.make<string[]>([])
      const telegram = new MockTelegramClient()
      Object.defineProperty(telegram, 'sendMessage', {
        value: (_chatId: number, text: string) => Ref.update(alerts, (messages) => [...messages, text]).pipe(Effect.as(1)),
      })

      const pass = (manual = false) =>
        Effect.gen(function* () {
          const context = yield* makeTestContext({ bazarr, ffmpeg, plex, telegram, tmdb })
          yield* (
            manual
              ? Effect.gen(function* () {
                  yield* subtitleScanCommand(telegram, { chat: { id: 1 }, message_id: 1 } satisfies TelegramMessageIn)
                  yield* (yield* BackgroundTasks).awaitEmpty
                })
              : runSubtitleScan
          ).pipe(Effect.provide(context))
        })

      yield* pass()
      expect(bazarr.lookups.get(primaryFile)).toBe(1)
      expect(bazarr.lookups.get(frenchMovie.path)).toBe(1)
      expect(bazarr.lookups.get(episodeFile)).toBeUndefined()
      expect(yield* Ref.get(probes)).toEqual([primaryFile])
      expect(bazarr.profileWrites).toEqual([[frenchMovie, 7]])

      yield* pass(true)
      expect(bazarr.lookups.get(primaryFile)).toBe(1)
      expect(yield* Ref.get(probes)).toEqual([primaryFile])
      expect(bazarr.profileWrites).toEqual([[frenchMovie, 7]])

      yield* fs.writeFileString(french, subtitle([5, 25, 45]))
      primary.subtitles.push({ forced: false, hi: false, language: 'fr', path: french })
      yield* pass()
      expect(bazarr.lookups.get(primaryFile)).toBe(2)
      expect(yield* Ref.get(probes)).toEqual([primaryFile, primaryFile])
      expect(bazarr.syncs).toEqual([{ forced: false, hi: false, language: 'fr', path: french }])
      expect(bazarr.syncs).not.toContainEqual({ forced: false, hi: false, language: 'en', path: english })
      expect(bazarr.profileWrites).toEqual([[frenchMovie, 7]])

      yield* TestClock.adjust(3 * DAY + 1)
      yield* pass()
      expect(bazarr.translations).toEqual(['es'])
      expect((yield* Ref.get(alerts)).filter((message) => message.startsWith('No subtitles'))).toEqual([
        'No subtitles for Episode after 3 days (missing: en)',
      ])
      expect(bazarr.lookups.get(primaryFile)).toBe(2)
      expect(yield* Ref.get(probes)).toEqual([primaryFile, primaryFile])
      expect(bazarr.profileWrites).toEqual([[frenchMovie, 7]])
      expect(yield* Effect.promise(() => db.select().from(subtitleScans))).toHaveLength(2)
    })
  )
})
