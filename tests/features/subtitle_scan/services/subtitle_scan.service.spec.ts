import { beforeEach, spyOn } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { testEnv } from '@tests/env'
import { describe, expect, it } from '@tests/it'
import { sendMessageMock } from '@tests/utils'
import { DateTime, Effect, FileSystem } from 'effect'

import { subtitleScans } from '@/database/schema'
import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { getScan, recordScan } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { scanMediaSubtitles } from '@/features/subtitle_scan/services/subtitle_scan.service'
import { type SubtitleScanMedia } from '@/features/subtitle_scan/types'
import { type BazarrItem, type BazarrItemRef, type BazarrSubtitleRef, type IBazarrClient } from '@/integrations/bazarr/bazarr.service'
import { type IFfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { NetworkError } from '@/shared/errors/network'
import { type ISOCode1 } from '@/shared/types/iso_codes'

const clean = () => Effect.promise(() => db.delete(subtitleScans))
const details = (file: string): SubtitleScanMedia => ({ file, mediaTitle: 'Movie', mediaType: 'movie', preferredLanguage: 'en' })
const subtitleContent = (offset = 0) =>
  Array.from({ length: 6 }, (_entry, index) => {
    const second = String(index * 10 + offset).padStart(2, '0')
    const end = String(index * 10 + offset + 4).padStart(2, '0')
    return `${index + 1}\n00:00:${second},000 --> 00:00:${end},000\ntext`
  }).join('\n\n')

const ffmpeg: IFfmpegClient = {
  execute: (..._command) => Effect.succeed(''),
  executeFfmpeg: (_params) => Effect.succeed(''),
  ffprobe: (_input) => Effect.succeed({ duration: 100, streams: [] }),
}

const bazarr = (
  file: string,
  subtitlePaths: readonly string[],
  onSync: (subtitle: BazarrSubtitleRef) => Effect.Effect<void, NetworkError> = () => Effect.void
) => {
  const item: BazarrItem = {
    id: 7,
    kind: 'movie',
    missingSubtitles: [],
    path: file,
    subtitles: subtitlePaths.map((path) => ({ forced: false, hi: false, language: 'en', path })),
    title: 'Movie',
  }
  const client: IBazarrClient = {
    deleteSubtitle: (_item, _subtitle) => Effect.void,
    getEpisodeByPath: (_path) => Effect.void.pipe(Effect.as(undefined)),
    getMovieByPath: (_path) => Effect.void.pipe(Effect.as(undefined)),
    getProfiles: Effect.succeed([]),
    getWantedEpisodes: Effect.succeed([]),
    getWantedMovies: Effect.succeed([]),
    setProfile: (_item: Extract<BazarrItemRef, { kind: 'movie' }>, _profile) => Effect.void,
    syncSubtitle: (_item, subtitle) => onSync(subtitle),
    translateSubtitle: (_item, _source, _target: ISOCode1) => Effect.void,
  }
  return { client, item }
}

const run = (media: SubtitleScanMedia, item: BazarrItem | undefined, client: IBazarrClient) =>
  provideTest(scanMediaSubtitles(media, Effect.succeed(item)), { bazarr: client, ffmpeg })

describe('scanMediaSubtitles', () => {
  beforeEach(() => {
    sendMessageMock.mockReset().mockResolvedValue(100)
    return Effect.runPromise(clean())
  })

  it.live('uses path identity: accepted same-path replacements skip unread, while renamed and version-invalidated sidecars are eligible', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const subtitle = `${directory}/Movie.en.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(subtitle, subtitleContent())
      const { client, item } = bazarr(file, [subtitle])
      yield* run(details(file), item, client)
      expect(yield* provideTest(getScan(subtitle, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })
      yield* fs.remove(subtitle)
      yield* fs.symlink(`${directory}/missing.srt`, subtitle)
      yield* provideTest(scanMediaSubtitles(details(file), Effect.die('registered path must not look up Bazarr')), { bazarr: client, ffmpeg })

      const otherDirectory = `${directory}/other`
      const renamedFile = `${otherDirectory}/Renamed.mkv`
      const renamedSubtitle = `${otherDirectory}/Renamed.en.srt`
      yield* fs.makeDirectory(otherDirectory)
      yield* fs.writeFileString(renamedFile, '')
      yield* fs.writeFileString(renamedSubtitle, subtitleContent())
      const renamed = bazarr(renamedFile, [renamedSubtitle])
      yield* run(details(renamedFile), renamed.item, renamed.client)
      expect(yield* provideTest(getScan(renamedSubtitle, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })

      const versioned = `${directory}/Versioned.en.srt`
      const versionedFile = `${directory}/Versioned.mkv`
      yield* fs.writeFileString(versionedFile, '')
      yield* fs.writeFileString(versioned, subtitleContent())
      yield* provideTest(recordScan({ filePath: versioned, scanVersion: 0, scannedAt: yield* DateTime.nowAsDate, verdict: 'passed' }))
      const versionedBazarr = bazarr(versionedFile, [versioned])
      yield* run(details(versionedFile), versionedBazarr.item, versionedBazarr.client)
      expect(yield* provideTest(getScan(versioned, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('syncs a newcomer against a passed reference, both new divergent files, and deduplicates three-way targets', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const paths = ['en', 'fr', 'de'].map((language) => `${directory}/Movie.${language}.srt`)
      yield* fs.writeFileString(file, '')
      for (const [index, path] of paths.entries()) {
        yield* fs.writeFileString(path, subtitleContent(index * 2))
      }
      const [english, french] = paths
      if (english === undefined || french === undefined) {
        throw new Error('missing test paths')
      }
      yield* provideTest(
        recordScan({
          filePath: english,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      const synced: string[] = []
      const { client, item } = bazarr(file, paths, (subtitle) => Effect.sync(() => void synced.push(subtitle.path)))
      yield* run(details(file), item, client)
      expect(synced).toEqual(expect.arrayContaining([french, paths[2]]))
      expect(synced).toHaveLength(2)
      expect(sendMessageMock.mock.calls).toEqual([
        [testEnv.TELEGRAM_CHAT_ID, 'Subtitle resync requested for Movie (de)', undefined],
        [testEnv.TELEGRAM_CHAT_ID, 'Subtitle resync requested for Movie (fr)', undefined],
      ])
      yield* run(details(file), item, client)
      expect(sendMessageMock).toHaveBeenCalledTimes(2)
      expect(synced).toHaveLength(2)

      yield* Effect.promise(() => db.delete(subtitleScans))
      synced.length = 0
      sendMessageMock.mockClear()
      yield* run(details(file), item, client)
      expect(synced).toHaveLength(3)
      expect(sendMessageMock).toHaveBeenCalledTimes(3)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('keeps sync verdicts and continues notifying when Telegram fails, without retrying on the next pass', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const paths = [`${directory}/Movie.en.srt`, `${directory}/Movie.fr.srt`]
      yield* fs.writeFileString(file, '')
      for (const [index, path] of paths.entries()) {
        yield* fs.writeFileString(path, subtitleContent(index * 2))
      }
      const synced: string[] = []
      const { client, item } = bazarr(file, paths, (subtitle) => Effect.sync(() => void synced.push(subtitle.path)))
      sendMessageMock.mockRejectedValueOnce(new Error('Telegram unavailable'))

      yield* run(details(file), item, client)
      expect(synced).toHaveLength(2)
      expect(sendMessageMock).toHaveBeenCalledTimes(2)
      for (const path of paths) {
        expect(yield* provideTest(getScan(path, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'sync_requested' })
      }

      yield* run(details(file), item, client)
      expect(synced).toHaveLength(2)
      expect(sendMessageMock).toHaveBeenCalledTimes(2)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('does not turn a successful sync into passed when the verdict registry write fails', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const firstCandidate = `${directory}/Movie.en.srt`
      const secondCandidate = `${directory}/Movie.fr.srt`
      const reference = `${directory}/Movie.it.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(firstCandidate, subtitleContent())
      yield* fs.writeFileString(secondCandidate, subtitleContent(2))
      yield* fs.writeFileString(reference, subtitleContent(4))
      yield* provideTest(
        recordScan({
          filePath: reference,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      const originalInsert = db.insert.bind(db)
      const insert = spyOn(db, 'insert')
        .mockImplementationOnce(originalInsert)
        .mockImplementationOnce(() => {
          throw new Error('registry unavailable')
        })
      const syncing = bazarr(file, [firstCandidate, secondCandidate, reference])
      const result = yield* Effect.exit(run(details(file), syncing.item, syncing.client))
      insert.mockRestore()
      expect(result._tag).toBe('Failure')
      expect(yield* provideTest(getScan(firstCandidate, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'sync_requested' })
      expect(yield* provideTest(getScan(secondCandidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      expect(sendMessageMock).toHaveBeenCalledTimes(1)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('leaves unresolved items, probe/read failures, unresolved targets, and failed deletes eligible', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const candidate = `${directory}/Movie.en.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(candidate, subtitleContent())
      const empty = bazarr(file, [])
      yield* Effect.exit(run(details(file), undefined, empty.client))
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      yield* Effect.exit(
        provideTest(scanMediaSubtitles(details(file), Effect.fail(new NetworkError({ originalMessage: 'lookup failed', serviceName: 'test' }))), {
          bazarr: empty.client,
          ffmpeg,
        })
      )
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()

      const probeFailure: IFfmpegClient = { ...ffmpeg, ffprobe: (_input) => Effect.die('ffprobe failed') }
      yield* Effect.exit(provideTest(scanMediaSubtitles(details(file), Effect.succeed(empty.item)), { bazarr: empty.client, ffmpeg: probeFailure }))
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()

      yield* fs.remove(candidate)
      yield* fs.symlink(`${directory}/missing.srt`, candidate)
      expect((yield* Effect.exit(run(details(file), empty.item, empty.client)))._tag).toBe('Failure')
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      yield* fs.remove(candidate)
      yield* fs.writeFileString(candidate, subtitleContent())

      const reference = `${directory}/Movie.fr.srt`
      yield* fs.writeFileString(reference, subtitleContent(2))
      yield* provideTest(
        recordScan({
          filePath: reference,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      yield* run(details(file), empty.item, empty.client)
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()

      yield* Effect.promise(() => db.delete(subtitleScans))
      yield* fs.writeFileString(candidate, '1\n00:00:00,000 --> 00:00:01,000\nforced')
      const deleting = bazarr(file, [candidate])
      const failedDelete: IBazarrClient = {
        ...deleting.client,
        deleteSubtitle: (_item, _subtitle) => Effect.fail(new NetworkError({ originalMessage: 'offline', serviceName: 'test' })),
      }
      yield* run(details(file), deleting.item, failedDelete)
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('removes heuristic forced candidates and never reuses actioned paths as references', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const forced = `${directory}/Movie.en.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(forced, '1\n00:00:00,000 --> 00:00:01,000\nforced')
      const deleted: string[] = []
      const forcedBazarr = bazarr(file, [forced])
      const client: IBazarrClient = {
        ...forcedBazarr.client,
        deleteSubtitle: (_item, subtitle) => Effect.sync(() => void deleted.push(subtitle.path)),
      }
      const reference = `${directory}/Movie.it.srt`
      yield* fs.symlink(`${directory}/missing-reference.srt`, reference)
      yield* provideTest(
        recordScan({ filePath: reference, scanVersion: SUBTITLE_SCAN_VERSION, scannedAt: yield* DateTime.nowAsDate, verdict: 'passed' })
      )
      yield* run(details(file), forcedBazarr.item, client)
      expect(deleted).toEqual([forced])
      expect(yield* provideTest(getScan(forced, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'forced_removed' })
      yield* fs.writeFileString(forced, subtitleContent())
      yield* run(details(file), forcedBazarr.item, client)
      expect(deleted).toEqual([forced])
      expect(yield* provideTest(getScan(forced, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'forced_removed' })
      yield* fs.remove(reference)
      yield* fs.remove(forced)

      yield* Effect.promise(() => db.delete(subtitleScans))
      const actioned = `${directory}/Movie.fr.srt`
      const newcomer = `${directory}/Movie.de.srt`
      yield* fs.symlink(`${directory}/missing-actioned.srt`, actioned)
      yield* fs.writeFileString(newcomer, subtitleContent(2))
      yield* provideTest(
        recordScan({
          filePath: actioned,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'sync_requested',
        })
      )
      const synced: string[] = []
      const actionedBazarr = bazarr(file, [actioned, newcomer], (subtitle) => Effect.sync(() => void synced.push(subtitle.path)))
      yield* run(details(file), actionedBazarr.item, actionedBazarr.client)
      expect(synced).toEqual([])
      expect(yield* provideTest(getScan(newcomer, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('processes identical pending sidecars independently and records their paths after synchronous rewrites', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const reference = `${directory}/Movie.en.srt`
      const first = `${directory}/Movie.fr.srt`
      const duplicate = `${directory}/Movie.it.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(reference, subtitleContent())
      yield* fs.writeFileString(first, subtitleContent(2))
      yield* fs.writeFileString(duplicate, subtitleContent(2))
      yield* provideTest(
        recordScan({
          filePath: reference,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      const synced: string[] = []
      const identical = bazarr(file, [reference, first, duplicate], (subtitle) => Effect.sync(() => void synced.push(subtitle.path)))
      yield* run(details(file), identical.item, identical.client)
      expect(synced).toEqual(expect.arrayContaining([first, duplicate]))
      expect(synced).toHaveLength(2)
      expect(yield* provideTest(getScan(first, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'sync_requested' })
      expect(yield* provideTest(getScan(duplicate, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'sync_requested' })

      yield* Effect.promise(() => db.delete(subtitleScans))
      const rewritten = `${directory}/Movie.it.srt`
      yield* fs.writeFileString(rewritten, subtitleContent(2))
      const rewriting = bazarr(file, [reference, rewritten], () =>
        Effect.promise(() => Bun.write(rewritten, subtitleContent(4)).then(() => undefined))
      )
      yield* run(details(file), rewriting.item, rewriting.client)
      expect(yield* provideTest(getScan(rewritten, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'sync_requested' })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('keeps unresolved targets and failed syncs unregistered, while explicit forced names are ignored', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const candidate = `${directory}/Movie.en.srt`
      const forced = `${directory}/Movie.fr.forced.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(candidate, subtitleContent())
      yield* fs.writeFileString(forced, 'explicit forced filename')
      const { client, item } = bazarr(file, [])
      yield* run(details(file), item, client)
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })
      expect(yield* provideTest(getScan(forced, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      yield* Effect.promise(() => db.delete(subtitleScans))

      const reference = `${directory}/Movie.de.srt`
      yield* fs.writeFileString(reference, subtitleContent(2))
      yield* provideTest(
        recordScan({
          filePath: reference,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      const failing = bazarr(file, [candidate, reference], () => Effect.fail(new NetworkError({ originalMessage: 'offline', serviceName: 'test' })))
      yield* run(details(file), failing.item, failing.client)
      expect(yield* provideTest(getScan(candidate, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      expect(sendMessageMock).not.toHaveBeenCalled()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )
})
