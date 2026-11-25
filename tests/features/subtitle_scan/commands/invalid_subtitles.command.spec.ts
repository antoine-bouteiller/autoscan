/* oxlint-disable unicorn/no-null -- nullable subtitle identity columns are part of the registry contract. */
import { beforeEach } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { blacklistSubtitleMock, getSubtitleSourcesMock } from '@tests/mocks/bazarr.mock'
import { answerCallbackQueryMock, MockBazarrClient, MockTelegramClient, sendMessageMock } from '@tests/utils'
import { DateTime, Effect, FileSystem } from 'effect'

import { deleteSubtitleAction, invalidSubtitlesCommand } from '@/features/subtitle_scan/commands/invalid_subtitles.command'
import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { getScan, recordScan, type SubtitleVerdict } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { deleteSubtitleButton } from '@/features/subtitle_scan/services/invalid_subtitles.service'
import { statFile } from '@/features/subtitle_scan/services/scan_registry.service'
import { type BazarrItem, type BazarrItemRef, type BazarrSubtitleRef } from '@/integrations/bazarr/bazarr.service'

class LibraryBazarr extends MockBazarrClient {
  readonly deleted: { item: BazarrItemRef; subtitle: BazarrSubtitleRef }[] = []
  private readonly item: BazarrItem

  constructor(item: BazarrItem) {
    super()
    this.item = item
  }

  override getMovieByPath(filePath: string) {
    return Effect.succeed(filePath === this.item.path ? this.item : undefined)
  }

  override deleteSubtitle(item: BazarrItemRef, subtitle: BazarrSubtitleRef) {
    return Effect.sync(() => void this.deleted.push({ item, subtitle }))
  }
}

const client = new MockTelegramClient()
const chat = { chat: { id: 1 }, message_id: 1 }
const tap = (filePath: string) => {
  const data = deleteSubtitleButton(filePath, '').callback_data
  return deleteSubtitleAction(client, { data, id: 'callback', message: chat }, data.split(':')[1] ?? '')
}
const subtitle = (path: string, language: 'en' | 'fr'): BazarrSubtitleRef => ({ forced: false, hi: false, language, path })
const record = (filePath: string, verdict: SubtitleVerdict = 'invalid') =>
  DateTime.nowAsDate.pipe(
    Effect.flatMap((scannedAt) =>
      provideTest(recordScan({ evidence: null, fileMtime: null, filePath, fileSize: null, scanVersion: SUBTITLE_SCAN_VERSION, scannedAt, verdict }))
    )
  )

const recordStatted = (filePath: string) =>
  Effect.gen(function* () {
    const { mtime, size } = yield* statFile(filePath)
    yield* provideTest(
      recordScan({
        evidence: null,
        fileMtime: mtime,
        filePath,
        fileSize: size,
        scanVersion: SUBTITLE_SCAN_VERSION,
        scannedAt: new Date(),
        verdict: 'invalid',
      })
    )
  })

const library = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const directory = yield* fs.makeTempDirectoryScoped()
  const media = `${directory}/Movie (2015).mkv`
  const english = `${directory}/Movie (2015).en.srt`
  const french = `${directory}/Movie (2015).fr.srt`
  for (const file of [media, `${directory}/Movie (2015).nfo`, english, french]) {
    yield* fs.writeFileString(file, '')
  }
  const bazarr = new LibraryBazarr({
    id: 7,
    kind: 'movie',
    missingSubtitles: [],
    path: media,
    subtitles: [subtitle(english, 'en'), subtitle(french, 'fr')],
    title: 'Movie',
  })
  return { bazarr, directory, english, french }
})

describe('invalid subtitles command', () => {
  beforeEach(async () => {
    sendMessageMock.mockClear().mockResolvedValue(100)
    answerCallbackQueryMock.mockClear()
    getSubtitleSourcesMock.mockReset().mockResolvedValue(new Map())
    blacklistSubtitleMock.mockReset().mockResolvedValue(undefined)
    await testSql`DELETE FROM subtitle_scans`
  })

  it.live('lists only current invalid subtitles with a delete button each', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(invalidSubtitlesCommand(client, chat))).toEqual({ step: 'idle' })
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'No invalid subtitles.', undefined)

      yield* record('/library/B.fr.srt')
      yield* record('/library/A.en.srt')
      yield* record('/library/A.de.srt', 'passed')
      yield* provideTest(
        recordScan({
          evidence: null,
          fileMtime: null,
          filePath: '/library/Old.en.srt',
          fileSize: null,
          scanVersion: 0,
          scannedAt: new Date(),
          verdict: 'invalid',
        })
      )
      yield* provideTest(invalidSubtitlesCommand(client, chat))

      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Invalid subtitles (tap to delete through Bazarr):', {
        replyMarkup: {
          inline_keyboard: [[deleteSubtitleButton('/library/A.en.srt', '🗑️ A.en.srt')], [deleteSubtitleButton('/library/B.fr.srt', '🗑️ B.fr.srt')]],
        },
      })
    })
  )

  it.live('deletes the tapped subtitle through Bazarr and forgets only its verdict', () =>
    Effect.gen(function* () {
      const { bazarr, english, french } = yield* library
      yield* recordStatted(english)
      yield* recordStatted(french)

      yield* provideTest(tap(french), { bazarr })

      expect(answerCallbackQueryMock).toHaveBeenCalledWith('callback')
      expect(bazarr.deleted).toEqual([
        { item: expect.objectContaining({ id: 7, kind: 'movie' }), subtitle: expect.objectContaining({ language: 'fr', path: french }) },
      ])
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Deleted Movie (2015).fr.srt.', undefined)
      expect(yield* provideTest(getScan(french, SUBTITLE_SCAN_VERSION))).toBeUndefined()
      expect(yield* provideTest(getScan(english, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'invalid' })

      yield* provideTest(tap(french), { bazarr })
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'This subtitle is no longer marked invalid.', undefined)
      expect(bazarr.deleted).toHaveLength(1)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('forgets an already deleted file and keeps a subtitle Bazarr does not track', () =>
    Effect.gen(function* () {
      const { bazarr, directory, english } = yield* library
      const fs = yield* FileSystem.FileSystem
      const gone = `${directory}/Movie (2015).de.srt`
      const untracked = `${directory}/Other.en.srt`
      yield* fs.writeFileString(untracked, '')
      yield* record(gone)
      yield* recordStatted(untracked)

      yield* provideTest(tap(gone), { bazarr })
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Movie (2015).de.srt was already deleted.', undefined)
      expect(yield* provideTest(getScan(gone, SUBTITLE_SCAN_VERSION))).toBeUndefined()

      yield* provideTest(tap(untracked), { bazarr })
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Bazarr does not track Other.en.srt; it was not deleted.', undefined)
      expect(yield* provideTest(getScan(untracked, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'invalid' })
      expect(bazarr.deleted).toEqual([])
      expect(yield* fs.exists(english)).toBe(true)
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('blacklists a provider subtitle instead of deleting it and forgets its verdict', () =>
    Effect.gen(function* () {
      const { bazarr, french } = yield* library
      yield* recordStatted(french)
      getSubtitleSourcesMock.mockResolvedValue(new Map([[french, { kind: 'provider', provider: 'opensubtitlescom', subsId: 'abc' }]]))

      yield* provideTest(tap(french), { bazarr })

      expect(blacklistSubtitleMock).toHaveBeenCalledTimes(1)
      expect(blacklistSubtitleMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, kind: 'movie' }),
        expect.objectContaining({ path: french }),
        { kind: 'provider', provider: 'opensubtitlescom', subsId: 'abc' }
      )
      expect(bazarr.deleted).toEqual([])
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'Deleted Movie (2015).fr.srt.', undefined)
      expect(yield* provideTest(getScan(french, SUBTITLE_SCAN_VERSION))).toBeUndefined()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('deletes a translated subtitle or one without history through Bazarr', () =>
    Effect.gen(function* () {
      const { bazarr, english, french } = yield* library
      yield* recordStatted(english)
      yield* recordStatted(french)
      getSubtitleSourcesMock.mockResolvedValue(new Map([[french, { kind: 'translation' }]]))

      yield* provideTest(tap(french), { bazarr })
      yield* provideTest(tap(english), { bazarr })

      expect(bazarr.deleted.map((entry) => entry.subtitle.path)).toEqual([french, english])
      expect(blacklistSubtitleMock).not.toHaveBeenCalled()
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('keeps the row and fails when the blacklist call fails', () =>
    Effect.gen(function* () {
      const { bazarr, french } = yield* library
      yield* recordStatted(french)
      getSubtitleSourcesMock.mockResolvedValue(new Map([[french, { kind: 'provider', provider: 'opensubtitlescom', subsId: 'abc' }]]))
      blacklistSubtitleMock.mockRejectedValue(new Error('boom'))

      expect(yield* Effect.flip(provideTest(tap(french), { bazarr }))).toBeDefined()
      expect(yield* provideTest(getScan(french, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'invalid' })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('keeps the row and fails when the history lookup fails', () =>
    Effect.gen(function* () {
      const { bazarr, french } = yield* library
      yield* recordStatted(french)
      getSubtitleSourcesMock.mockRejectedValue(new Error('boom'))

      expect(yield* Effect.flip(provideTest(tap(french), { bazarr }))).toBeDefined()
      expect(bazarr.deleted).toEqual([])
      expect(yield* provideTest(getScan(french, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'invalid' })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it.live('leaves a row alone when the file changed since it was assessed', () =>
    Effect.gen(function* () {
      const { bazarr, french } = yield* library
      const fs = yield* FileSystem.FileSystem
      yield* recordStatted(french)
      yield* fs.writeFileString(french, 'replaced')

      yield* provideTest(tap(french), { bazarr })

      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'This subtitle is no longer marked invalid.', undefined)
      expect(getSubtitleSourcesMock).not.toHaveBeenCalled()
      expect(blacklistSubtitleMock).not.toHaveBeenCalled()
      expect(bazarr.deleted).toEqual([])
      expect(yield* provideTest(getScan(french, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'invalid' })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  for (const history of ['provider', 'no provider'] as const) {
    it.live(`leaves a replacement alone when it lands during the ${history} history lookup`, () =>
      Effect.gen(function* () {
        const { bazarr, french } = yield* library
        yield* recordStatted(french)
        getSubtitleSourcesMock.mockImplementation(async () => {
          await Bun.write(french, 'replaced')
          return new Map(history === 'provider' ? [[french, { kind: 'provider', provider: 'opensubtitlescom', subsId: 'abc' }]] : [])
        })

        yield* provideTest(tap(french), { bazarr })

        expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'This subtitle is no longer marked invalid.', undefined)
        expect(blacklistSubtitleMock).not.toHaveBeenCalled()
        expect(bazarr.deleted).toEqual([])
        expect(yield* provideTest(getScan(french, SUBTITLE_SCAN_VERSION))).toMatchObject({ verdict: 'invalid' })
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
    )
  }
})
