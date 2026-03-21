import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vite-plus/test'

import { db } from '#config/db'
import { container, TOKENS } from '#core/container'
import { media as mediaTable, type Media } from '#database/schema'
import type { ITelegramClient } from '#integrations/telegram.service'
import {
  buildLanguageKeyboard,
  buildMediaKeyboard,
  buildMediaTypeKeyboard,
  handleUpdateLanguage,
  navigateMediaPage,
  selectLanguage,
  selectMedia,
  selectMediaType,
} from '#services/language.service'
import { iso1ToIso2T } from '#types/iso_codes'
import type { PlexMediaStream } from '#validators/plex.validator'

import { updateStreamMock } from '../mocks/plex.mock.js'
import { editMessageTextMock } from '../mocks/telegram.mock.js'
import {
  mockAudioStreamFrench,
  mockAudioStreamNotMatching,
  mockAudioStreams,
  mockAudioStreamSelected,
  mockNonAudioStreams,
} from '../resources/fixtures/media.fixtures.js'
import '../utils.ts'

const makeMedia = (n: number): Media[] =>
  Array.from({ length: n }, (_, i) => ({
    tmdbId: i + 1,
    title: `Media ${i + 1}`,
    type: 'movie',
    originalLanguage: 'en' as const,
    preferredLanguage: 'en' as const,
  }))

afterEach(async () => {
  await db.delete(mediaTable)
})

describe('buildMediaTypeKeyboard', () => {
  test('should return movie and show buttons', () => {
    const keyboard = buildMediaTypeKeyboard()
    const buttons = keyboard.inline_keyboard.flat()
    expect(buttons.some((b) => b.callback_data === 'movie')).toBe(true)
    expect(buttons.some((b) => b.callback_data === 'show')).toBe(true)
    expect(buttons).toHaveLength(2)
  })
})

describe('buildMediaKeyboard', () => {
  test('should render 5 buttons with no navigation for 5 items on page 0', () => {
    const keyboard = buildMediaKeyboard(makeMedia(5), 0)
    expect(keyboard.inline_keyboard).toHaveLength(5)
    const allButtons = keyboard.inline_keyboard.flat()
    expect(allButtons.some((b) => b.callback_data.startsWith('page:'))).toBe(false)
  })

  test('should render 10 buttons with Next for 15 items on page 0', () => {
    const keyboard = buildMediaKeyboard(makeMedia(15), 0)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((b) => b.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(10)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((b) => b.callback_data === 'page:1')).toBe(true)
    expect(navRow?.some((b) => b.callback_data === 'page:-1')).toBe(false)
  })

  test('should render 5 buttons with Previous and no Next for 15 items on page 1', () => {
    const keyboard = buildMediaKeyboard(makeMedia(15), 1)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((b) => b.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(5)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((b) => b.callback_data === 'page:0')).toBe(true)
    expect(navRow?.some((b) => b.callback_data === 'page:2')).toBe(false)
  })

  test('should render 10 buttons with Previous and Next for 25 items on page 1', () => {
    const keyboard = buildMediaKeyboard(makeMedia(25), 1)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((b) => b.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(10)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((b) => b.callback_data === 'page:0')).toBe(true)
    expect(navRow?.some((b) => b.callback_data === 'page:2')).toBe(true)
  })
})

describe('buildLanguageKeyboard', () => {
  test('should have at most 6 buttons per row', () => {
    const keyboard = buildLanguageKeyboard()
    for (const row of keyboard.inline_keyboard) {
      expect(row.length).toBeLessThanOrEqual(6)
    }
  })

  test('should include all ISO 639-1 codes', () => {
    const keyboard = buildLanguageKeyboard()
    const allCodes = keyboard.inline_keyboard.flat().map((b) => b.callback_data.slice('lang:'.length))
    const expectedCodes = Object.keys(iso1ToIso2T)
    expect(allCodes.toSorted()).toEqual(expectedCodes.toSorted())
  })
})

describe('selectMediaType', () => {
  const client = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should return idle state when media list is empty', async () => {
    const state = { step: 'awaiting_media_type' as const, messageId: 42 }

    const result = await selectMediaType(client, 1, state, 'movie')

    expect(result).toEqual({ step: 'idle' })
    expect(editMessageTextMock).toHaveBeenCalledWith(1, 42, 'No media in movie library')
  })

  test('should return awaiting_media_selection state with non-empty media list', async () => {
    await db.insert(mediaTable).values(makeMedia(3))
    const state = { step: 'awaiting_media_type' as const, messageId: 42 }

    const result = await selectMediaType(client, 1, state, 'movie')

    expect(result).toEqual({ step: 'awaiting_media_selection', messageId: 42, mediaType: 'movie', page: 0 })
    expect(editMessageTextMock).toHaveBeenCalledWith(
      1,
      42,
      'Which movie do you want to configure?',
      expect.objectContaining({ inline_keyboard: expect.any(Array) })
    )
  })
})

describe('navigateMediaPage', () => {
  const client = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should update message and return state with new page', async () => {
    await db.insert(mediaTable).values(makeMedia(15))
    const state = { step: 'awaiting_media_selection' as const, messageId: 42, mediaType: 'movie' as const, page: 0 }

    const result = await navigateMediaPage(client, 1, state, 1)

    expect(result).toEqual({ ...state, page: 1 })
    expect(editMessageTextMock).toHaveBeenCalledWith(
      1,
      42,
      'Which movie do you want to configure?',
      expect.objectContaining({ inline_keyboard: expect.any(Array) })
    )
  })
})

describe('selectMedia', () => {
  const client = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should return unchanged state when tmdbId not found', async () => {
    await db.insert(mediaTable).values(makeMedia(3))
    const state = { step: 'awaiting_media_selection' as const, messageId: 42, mediaType: 'movie' as const, page: 0 }

    const result = await selectMedia(client, 1, state, 999)

    expect(result).toEqual(state)
    expect(editMessageTextMock).not.toHaveBeenCalled()
  })

  test('should return awaiting_language state when tmdbId is found', async () => {
    await db.insert(mediaTable).values(makeMedia(3))
    const state = { step: 'awaiting_media_selection' as const, messageId: 42, mediaType: 'movie' as const, page: 0 }

    const result = await selectMedia(client, 1, state, 2)

    expect(result).toEqual({ step: 'awaiting_language', messageId: 42, tmdbId: 2, mediaType: 'movie' })
    expect(editMessageTextMock).toHaveBeenCalledWith(
      1,
      42,
      'Which language do you want to set for Media 2?',
      expect.objectContaining({ inline_keyboard: expect.any(Array) })
    )
  })
})

describe('selectLanguage', () => {
  const client = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should update preferred language in db, edit message, and return idle state', async () => {
    await db.insert(mediaTable).values({ tmdbId: 1, title: 'Test Movie', type: 'movie', originalLanguage: 'en', preferredLanguage: 'en' })
    const state = { step: 'awaiting_language' as const, messageId: 42, tmdbId: 1, mediaType: 'movie' as const }

    const result = await selectLanguage(client, 1, state, 'fr')

    expect(result).toEqual({ step: 'idle' })
    expect(editMessageTextMock).toHaveBeenCalledWith(1, 42, 'Language updated to fr')
    const [updated] = await db
      .select()
      .from(mediaTable)
      .where(and(eq(mediaTable.tmdbId, 1), eq(mediaTable.type, 'movie')))
    expect(updated?.preferredLanguage).toBe('fr')
  })
})

describe('handleUpdateLanguage', () => {
  beforeEach(() => {
    updateStreamMock.mockRestore()
  })

  test('should update audio stream if original language stream found and not selected', async () => {
    await handleUpdateLanguage({
      mediaTitle: 'Test Movie',
      partsId: 123,
      preferredLanguage: 'fr',
      streams: mockAudioStreams,
    })

    expect(updateStreamMock).toHaveBeenCalledWith(123, 1, 'audio')
    expect(updateStreamMock).toHaveBeenCalledWith(123, 0, 'subtitle')
  })

  test('should not update if audio stream already selected', async () => {
    await handleUpdateLanguage({
      mediaTitle: 'Test Movie',
      partsId: 123,
      preferredLanguage: 'en',
      streams: mockAudioStreamSelected,
    })

    expect(updateStreamMock).not.toHaveBeenCalled()
  })

  test('should not update if no matching audio stream found', async () => {
    await handleUpdateLanguage({
      mediaTitle: 'Test Movie',
      partsId: 123,
      preferredLanguage: 'es',
      streams: mockAudioStreamNotMatching,
    })

    expect(updateStreamMock).not.toHaveBeenCalled()
  })

  test('should handle fre to fr conversion', async () => {
    await handleUpdateLanguage({
      mediaTitle: 'Test Movie',
      partsId: 123,
      preferredLanguage: 'fr',
      streams: mockAudioStreamFrench,
    })

    expect(updateStreamMock).toHaveBeenCalledWith(123, 1, 'audio')
    expect(updateStreamMock).toHaveBeenCalledWith(123, 0, 'subtitle')
  })

  test('should use audio stream ID for non-French languages', async () => {
    const mockEngStream: PlexMediaStream[] = [
      {
        id: 5,
        languageCode: 'eng',
        selected: false,
        streamType: 2,
      },
    ]

    await handleUpdateLanguage({
      mediaTitle: 'Test Movie',
      partsId: 456,
      preferredLanguage: 'en',
      streams: mockEngStream,
    })

    expect(updateStreamMock).toHaveBeenCalledWith(456, 5, 'audio')
  })

  test('should ignore non-audio streams', async () => {
    await handleUpdateLanguage({
      mediaTitle: 'Test Movie',
      partsId: 123,
      preferredLanguage: 'en',
      streams: mockNonAudioStreams,
    })

    expect(updateStreamMock).not.toHaveBeenCalled()
  })
})
