import { beforeEach } from 'bun:test'

import { BunServices } from '@effect/platform-bun'
import { testSql } from '@tests/database'
import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { answerCallbackQueryMock, MockBazarrClient, MockTelegramClient, sendMessageMock } from '@tests/utils'
import { DateTime, Effect, FileSystem } from 'effect'

import { deleteSubtitleAction, invalidSubtitlesCommand } from '@/features/subtitle_scan/commands/invalid_subtitles.command'
import { SUBTITLE_SCAN_VERSION } from '@/features/subtitle_scan/constants'
import { getScan, recordScan, type SubtitleVerdict } from '@/features/subtitle_scan/repositories/subtitle_scan.repository'
import { deleteSubtitleButton } from '@/features/subtitle_scan/services/invalid_subtitles.service'
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
    Effect.flatMap((scannedAt) => provideTest(recordScan({ filePath, scanVersion: SUBTITLE_SCAN_VERSION, scannedAt, verdict })))
  )

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
    await testSql`DELETE FROM subtitle_scans`
  })

  it.live('lists only current invalid subtitles with a delete button each', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(invalidSubtitlesCommand(client, chat))).toEqual({ step: 'idle' })
      expect(sendMessageMock).toHaveBeenLastCalledWith(1, 'No invalid subtitles.', undefined)

      yield* record('/library/B.fr.srt')
      yield* record('/library/A.en.srt')
      yield* record('/library/A.de.srt', 'passed')
      yield* provideTest(recordScan({ filePath: '/library/Old.en.srt', scanVersion: 0, scannedAt: new Date(), verdict: 'invalid' }))
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
      yield* record(english)
      yield* record(french)

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
      yield* record(untracked)

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
})
