import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { container, TOKENS } from '#/core/container'
import { FileNotFoundError } from '#/domains/media/errors'
// oxlint-disable-next-line import/no-namespace -- namespace import required to spy on the named export
import * as metadataService from '#/domains/media/services/metadata.service'
import { subtitleScanCommand } from '#/features/transcoding/commands/subtitle_scan.command'
import { type MediaType } from '#/integrations/plex/plex.service'
import { type PlexMedia } from '#/integrations/plex/plex.validator'
import { type TelegramMessageIn } from '#/integrations/telegram/telegram.validator'
import { type ISOCode1 } from '#/shared/types/iso_codes'
import { sendMessageMock } from '#tests/mocks/telegram.mock'
import { makeTestDir, MockTelegramClient } from '#tests/utils'

const makeMessage = (chatId: number): TelegramMessageIn => ({
  chat: { id: chatId },
  message_id: 1,
})

const makeMedia = (ratingKey: string): PlexMedia => ({
  Media: [{ Part: [{ file: 'unused', id: 1 }] }],
  key: `${ratingKey}-key`,
  ratingKey,
  title: ratingKey,
  type: 'movie',
  year: 2023,
})

type MediaDetails = Awaited<ReturnType<typeof metadataService.getCompleteMediaDetails>>

const makeDetails = (file: string, originalLanguage: ISOCode1, mediaTitle: string): MediaDetails => ({
  file,
  mediaTitle,
  mediaType: 'movie' as MediaType,
  originalLanguage,
  partsId: 1,
  preferredLanguage: 'fr' as ISOCode1,
  streams: [],
  tmdbId: 1,
})

const SRT_ONE_BLOCK = '1\n00:00:01,000 --> 00:00:03,000\nHi'
const SRT_TWO_BLOCKS = '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nWorld'
const SRT_TWO_BLOCKS_OFFSET = '1\n00:00:01,500 --> 00:00:03,500\nBonjour\n\n2\n00:00:05,500 --> 00:00:07,500\nMonde'
const SRT_MANY_BLOCKS = Array.from({ length: 11 }, (_unused, idx) => `${idx + 1}\n00:00:0${idx % 9},000 --> 00:00:0${(idx % 9) + 1},000\nLine`).join(
  '\n\n'
)

describe('subtitleScanCommand', () => {
  const client = new MockTelegramClient()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should send starting message and return idle immediately', async () => {
    const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
    spyOn(plexClient, 'getSections').mockResolvedValue([])

    const state = await subtitleScanCommand(client, makeMessage(42))

    expect(state).toEqual({ step: 'idle' })
    expect(sendMessageMock).toHaveBeenCalledWith(42, 'Starting subtitle scan...')
  })

  test('should send default message when nothing is missing or out of sync', async () => {
    const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
    spyOn(plexClient, 'getSections').mockResolvedValue([])

    await subtitleScanCommand(client, makeMessage(42))

    await new Promise((resolve) => setImmediate(resolve))

    expect(sendMessageMock).toHaveBeenCalledWith(42, 'All media have matching subtitles.')
  })

  describe('analyzeMedia (background scan)', () => {
    let testDir: string
    const file = (name: string) => join(testDir, `${name}.mkv`)
    const srt = (name: string, lang: string, content: string) => writeFileSync(join(testDir, `${name}.${lang}.srt`), content)

    beforeEach(() => {
      testDir = makeTestDir()
    })
    afterEach(() => {
      rmSync(testDir, { recursive: true })
    })

    test('should classify media into missing and out-of-sync, then report', async () => {
      const plexClient = container.resolve(TOKENS.PLEX_CLIENT)
      spyOn(plexClient, 'getSections').mockResolvedValue([{ key: 1, title: 'Movies', type: 'movie' }])
      spyOn(plexClient, 'getSectionMedia').mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f'].map(makeMedia))

      srt('eng-only', 'en', SRT_TWO_BLOCKS)
      srt('ratio', 'en', SRT_ONE_BLOCK)
      srt('ratio', 'fr', SRT_MANY_BLOCKS)
      srt('sync', 'en', SRT_TWO_BLOCKS)
      srt('sync', 'fr', SRT_TWO_BLOCKS_OFFSET)

      const detailsSpy = spyOn(metadataService, 'getCompleteMediaDetails')
        .mockResolvedValueOnce(new FileNotFoundError({ mediaTitle: 'broken' }))
        .mockResolvedValueOnce(makeDetails(file('french'), 'fr', 'French Original'))
        .mockResolvedValueOnce(makeDetails(file('no-srt'), 'en', 'No Subs'))
        .mockResolvedValueOnce(makeDetails(file('eng-only'), 'en', 'English Only'))
        .mockResolvedValueOnce(makeDetails(file('ratio'), 'en', 'Forced Only'))
        .mockResolvedValueOnce(makeDetails(file('sync'), 'en', 'Out Of Sync'))

      await subtitleScanCommand(client, makeMessage(7))
      await new Promise((resolve) => setImmediate(resolve))

      const report = sendMessageMock.mock.calls.at(-1)?.[1]
      expect(report).toContain('No Subs')
      expect(report).toContain('Forced Only')
      expect(report).toContain('Out Of Sync')
      expect(report).not.toContain('English Only')
      expect(report).not.toContain('French Original')

      detailsSpy.mockRestore()
    })
  })
})
