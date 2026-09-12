import { beforeEach, spyOn } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { testDatabase as db } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { DateTime, Effect, FileSystem } from 'effect'

import { subtitleScans } from '@/database/schema'
import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { getScan, recordScan } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { discoverSubtitleFiles } from '@/features/subtitle_scan/services/subtitle_files.service'
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

const snapshot = (file: string, subtitle: string) =>
  discoverSubtitleFiles(file).pipe(
    Effect.map((files) => {
      const found = files.find((entry) => entry.path === subtitle)
      if (found === undefined) {
        throw new Error(`Missing test sidecar ${subtitle}`)
      }
      return found
    })
  )

const run = (media: SubtitleScanMedia, item: BazarrItem | undefined, client: IBazarrClient) =>
  provideTest(scanMediaSubtitles(media, Effect.succeed(item)), { bazarr: client, ffmpeg })

describe('scanMediaSubtitles', () => {
  beforeEach(() => Effect.runPromise(clean()))

  it.live('passes once, skips reruns and renames globally, while a rewrite and old version remain eligible', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const subtitle = `${directory}/Movie.en.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(subtitle, subtitleContent())
      const first = yield* snapshot(file, subtitle)
      const { client, item } = bazarr(file, [subtitle])
      yield* run(details(file), item, client)
      expect(yield* provideTest(getScan(first.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })
      yield* provideTest(scanMediaSubtitles(details(file), Effect.die('registered hash must not look up Bazarr')), { bazarr: client, ffmpeg })

      const renamedFile = `${directory}/Renamed.mkv`
      const renamedSubtitle = `${directory}/Renamed.en.srt`
      yield* fs.writeFileString(renamedFile, '')
      yield* fs.writeFileString(renamedSubtitle, subtitleContent())
      yield* run(details(renamedFile), item, client)
      expect(yield* provideTest(getScan(first.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({ filePath: subtitle })

      yield* fs.writeFileString(subtitle, subtitleContent(1))
      const rewritten = yield* snapshot(file, subtitle)
      yield* provideTest(
        recordScan({ filePath: subtitle, hash: rewritten.hash, scanVersion: 0, scannedAt: yield* DateTime.nowAsDate, verdict: 'passed' })
      )
      yield* run(details(file), item, client)
      expect(yield* provideTest(getScan(rewritten.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })
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
      const known = yield* snapshot(file, english)
      yield* provideTest(
        recordScan({
          filePath: english,
          hash: known.hash,
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

      yield* Effect.promise(() => db.delete(subtitleScans))
      synced.length = 0
      yield* run(details(file), item, client)
      expect(synced).toHaveLength(3)
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
      const firstSnapshot = yield* snapshot(file, firstCandidate)
      const secondSnapshot = yield* snapshot(file, secondCandidate)
      const referenceSnapshot = yield* snapshot(file, reference)
      yield* provideTest(
        recordScan({
          filePath: reference,
          hash: referenceSnapshot.hash,
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
      expect(yield* provideTest(getScan(firstSnapshot.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'sync_requested' })
      expect(yield* provideTest(getScan(secondSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('leaves unresolved items, probe failures, unresolved targets, and failed deletes eligible', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const candidate = `${directory}/Movie.en.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(candidate, subtitleContent())
      const candidateSnapshot = yield* snapshot(file, candidate)
      const empty = bazarr(file, [])
      yield* Effect.exit(run(details(file), undefined, empty.client))
      expect(yield* provideTest(getScan(candidateSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      yield* Effect.exit(
        provideTest(scanMediaSubtitles(details(file), Effect.fail(new NetworkError({ originalMessage: 'lookup failed', serviceName: 'test' }))), {
          bazarr: empty.client,
          ffmpeg,
        })
      )
      expect(yield* provideTest(getScan(candidateSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()

      const probeFailure: IFfmpegClient = { ...ffmpeg, ffprobe: (_input) => Effect.die('ffprobe failed') }
      yield* Effect.exit(provideTest(scanMediaSubtitles(details(file), Effect.succeed(empty.item)), { bazarr: empty.client, ffmpeg: probeFailure }))
      expect(yield* provideTest(getScan(candidateSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()

      const reference = `${directory}/Movie.fr.srt`
      yield* fs.writeFileString(reference, subtitleContent(2))
      const referenceSnapshot = yield* snapshot(file, reference)
      yield* provideTest(
        recordScan({
          filePath: reference,
          hash: referenceSnapshot.hash,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      yield* run(details(file), empty.item, empty.client)
      expect(yield* provideTest(getScan(candidateSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()

      yield* Effect.promise(() => db.delete(subtitleScans))
      yield* fs.writeFileString(candidate, '1\n00:00:00,000 --> 00:00:01,000\nforced')
      const forcedSnapshot = yield* snapshot(file, candidate)
      const deleting = bazarr(file, [candidate])
      const failedDelete: IBazarrClient = {
        ...deleting.client,
        deleteSubtitle: (_item, _subtitle) => Effect.fail(new NetworkError({ originalMessage: 'offline', serviceName: 'test' })),
      }
      yield* run(details(file), deleting.item, failedDelete)
      expect(yield* provideTest(getScan(forcedSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('removes heuristic forced candidates and never reuses actioned hashes as references', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/Movie.mkv`
      const forced = `${directory}/Movie.en.srt`
      yield* fs.writeFileString(file, '')
      yield* fs.writeFileString(forced, '1\n00:00:00,000 --> 00:00:01,000\nforced')
      const forcedSnapshot = yield* snapshot(file, forced)
      const deleted: string[] = []
      const forcedBazarr = bazarr(file, [forced])
      const client: IBazarrClient = {
        ...forcedBazarr.client,
        deleteSubtitle: (_item, subtitle) => Effect.sync(() => void deleted.push(subtitle.path)),
      }
      yield* run(details(file), forcedBazarr.item, client)
      expect(deleted).toEqual([forced])
      expect(yield* provideTest(getScan(forcedSnapshot.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'forced_removed' })

      yield* Effect.promise(() => db.delete(subtitleScans))
      const actioned = `${directory}/Movie.fr.srt`
      const newcomer = `${directory}/Movie.de.srt`
      yield* fs.writeFileString(actioned, subtitleContent())
      yield* fs.writeFileString(newcomer, subtitleContent(2))
      const actionedSnapshot = yield* snapshot(file, actioned)
      yield* provideTest(
        recordScan({
          filePath: actioned,
          hash: actionedSnapshot.hash,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'sync_requested',
        })
      )
      const synced: string[] = []
      const actionedBazarr = bazarr(file, [actioned, newcomer], (subtitle) => Effect.sync(() => void synced.push(subtitle.path)))
      yield* run(details(file), actionedBazarr.item, actionedBazarr.client)
      expect(synced).toEqual([])
      expect(yield* snapshot(file, newcomer).pipe(Effect.flatMap((entry) => provideTest(getScan(entry.hash, SUBTITLE_SCAN_VERSION))))).toMatchObject({
        verdict: 'passed',
      })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('uses one representative for identical pending hashes and records the captured hash after synchronous rewrites', () =>
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
      const referenceSnapshot = yield* snapshot(file, reference)
      const pendingSnapshot = yield* snapshot(file, first)
      yield* provideTest(
        recordScan({
          filePath: reference,
          hash: referenceSnapshot.hash,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      const synced: string[] = []
      const identical = bazarr(file, [reference, first, duplicate], (subtitle) => Effect.sync(() => void synced.push(subtitle.path)))
      yield* run(details(file), identical.item, identical.client)
      expect(synced).toHaveLength(1)
      expect([first, duplicate]).toContain(synced[0])
      expect(yield* provideTest(getScan(pendingSnapshot.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({
        filePath: synced[0],
        verdict: 'sync_requested',
      })

      yield* Effect.promise(() => db.delete(subtitleScans))
      const rewritten = `${directory}/Movie.it.srt`
      yield* fs.writeFileString(rewritten, subtitleContent(2))
      const captured = yield* snapshot(file, rewritten)
      const rewriting = bazarr(file, [reference, rewritten], () =>
        Effect.promise(() => Bun.write(rewritten, subtitleContent(4)).then(() => undefined))
      )
      yield* run(details(file), rewriting.item, rewriting.client)
      const after = yield* snapshot(file, rewritten)
      expect(after.hash).not.toBe(captured.hash)
      expect(yield* provideTest(getScan(captured.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'sync_requested' })
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
      const candidateSnapshot = yield* snapshot(file, candidate)
      const forcedSnapshot = yield* snapshot(file, forced)
      const { client, item } = bazarr(file, [])
      yield* run(details(file), item, client)
      expect(yield* provideTest(getScan(candidateSnapshot.hash, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'passed' })
      expect(yield* provideTest(getScan(forcedSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      yield* Effect.promise(() => db.delete(subtitleScans))

      const reference = `${directory}/Movie.de.srt`
      yield* fs.writeFileString(reference, subtitleContent(2))
      const referenceSnapshot = yield* snapshot(file, reference)
      yield* provideTest(
        recordScan({
          filePath: reference,
          hash: referenceSnapshot.hash,
          scanVersion: SUBTITLE_SCAN_VERSION,
          scannedAt: yield* DateTime.nowAsDate,
          verdict: 'passed',
        })
      )
      const failing = bazarr(file, [candidate, reference], () => Effect.fail(new NetworkError({ originalMessage: 'offline', serviceName: 'test' })))
      yield* run(details(file), failing.item, failing.client)
      expect(yield* provideTest(getScan(candidateSnapshot.hash, SUBTITLE_SCAN_VERSION))).toBeUndefined()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )
})
