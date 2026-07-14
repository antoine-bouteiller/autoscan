import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { updateStreamMock } from '@tests/mocks/plex.mock'
import { editMessageTextMock } from '@tests/mocks/telegram.mock'
import {
  mockAudioStreamFrench,
  mockAudioStreamNotMatching,
  mockAudioStreams,
  mockAudioStreamSelected,
  mockNonAudioStreams,
} from '@tests/resources/fixtures/media.fixtures'
import { and, eq } from 'drizzle-orm'

import { db } from '@/config/db'
import { container, TOKENS } from '@/core/container'
import { type Media, media as mediaTable } from '@/database/schema'
import {
  buildLanguageKeyboard,
  buildMediaKeyboard,
  buildMediaTypeKeyboard,
  handleUpdateLanguage,
  navigateMediaPage,
  selectLanguage,
  selectMedia,
  selectMediaType,
} from '@/features/language_sync/services/language.service'
import { type PlexMediaStream } from '@/integrations/plex/plex.validator'
import { iso1ToIso2T } from '@/shared/types/iso_codes'

import '../../../utils.ts'

const makeMedia = (count: number): Media[] =>
  Array.from({ length: count }, (_unused, index) => ({
    originalLanguage: 'en' as const,
    preferredLanguage: 'en' as const,
    title: `Media ${index + 1}`,
    tmdbId: index + 1,
    type: 'movie',
  }))

afterEach(async () => {
  await db.delete(mediaTable)
})

describe('buildMediaTypeKeyboard', () => {
  test('should return movie and show buttons', () => {
    const keyboard = buildMediaTypeKeyboard()
    const buttons = keyboard.inline_keyboard.flat()
    expect(buttons.some((btn) => btn.callback_data === 'movie')).toBe(true)
    expect(buttons.some((btn) => btn.callback_data === 'show')).toBe(true)
    expect(buttons).toHaveLength(2)
  })
})

describe('buildMediaKeyboard', () => {
  test('should render 5 buttons with no navigation for 5 items on page 0', () => {
    const keyboard = buildMediaKeyboard(makeMedia(5), 0)
    expect(keyboard.inline_keyboard).toHaveLength(5)
    const allButtons = keyboard.inline_keyboard.flat()
    expect(allButtons.some((btn) => btn.callback_data.startsWith('page:'))).toBe(false)
  })

  test('should render 10 buttons with Next for 15 items on page 0', () => {
    const keyboard = buildMediaKeyboard(makeMedia(15), 0)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((btn) => btn.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(10)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((btn) => btn.callback_data === 'page:1')).toBe(true)
    expect(navRow?.some((btn) => btn.callback_data === 'page:-1')).toBe(false)
  })

  test('should render 5 buttons with Previous and no Next for 15 items on page 1', () => {
    const keyboard = buildMediaKeyboard(makeMedia(15), 1)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((btn) => btn.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(5)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((btn) => btn.callback_data === 'page:0')).toBe(true)
    expect(navRow?.some((btn) => btn.callback_data === 'page:2')).toBe(false)
  })

  test('should render 10 buttons with Previous and Next for 25 items on page 1', () => {
    const keyboard = buildMediaKeyboard(makeMedia(25), 1)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((btn) => btn.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(10)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((btn) => btn.callback_data === 'page:0')).toBe(true)
    expect(navRow?.some((btn) => btn.callback_data === 'page:2')).toBe(true)
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
    const allCodes = keyboard.inline_keyboard.flat().map((btn) => btn.callback_data.slice('lang:'.length))
    const expectedCodes = Object.keys(iso1ToIso2T)
    expect(allCodes.toSorted()).toEqual(expectedCodes.toSorted())
  })
})

describe('selectMediaType', () => {
  const client = container.resolve(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should return idle state when media list is empty', async () => {
    const state = { messageId: 42, step: 'awaiting_media_type' as const }

    const result = await selectMediaType(client, 1, { mediaType: 'movie', state })

    expect(result).toEqual({ step: 'idle' })
    expect(editMessageTextMock).toHaveBeenCalledWith(1, 42, { text: 'No media in movie library' })
  })

  test('should return awaiting_media_selection state with non-empty media list', async () => {
    await db.insert(mediaTable).values(makeMedia(3))
    const state = { messageId: 42, step: 'awaiting_media_type' as const }

    const result = await selectMediaType(client, 1, { mediaType: 'movie', state })

    expect(result).toEqual({ mediaType: 'movie', messageId: 42, page: 0, step: 'awaiting_media_selection' })
    expect(editMessageTextMock).toHaveBeenCalledWith(
      1,
      42,
      expect.objectContaining({
        replyMarkup: expect.objectContaining({ inline_keyboard: expect.any(Array) }),
        text: 'Which movie do you want to configure?',
      })
    )
  })
})

describe('navigateMediaPage', () => {
  const client = container.resolve(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should update message and return state with new page', async () => {
    await db.insert(mediaTable).values(makeMedia(15))
    const state = { mediaType: 'movie' as const, messageId: 42, page: 0, step: 'awaiting_media_selection' as const }

    const result = await navigateMediaPage(client, 1, { page: 1, state })

    expect(result).toEqual({ ...state, page: 1 })
    expect(editMessageTextMock).toHaveBeenCalledWith(
      1,
      42,
      expect.objectContaining({
        replyMarkup: expect.objectContaining({ inline_keyboard: expect.any(Array) }),
        text: 'Which movie do you want to configure?',
      })
    )
  })
})

describe('selectMedia', () => {
  const client = container.resolve(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should return unchanged state when tmdbId not found', async () => {
    await db.insert(mediaTable).values(makeMedia(3))
    const state = { mediaType: 'movie' as const, messageId: 42, page: 0, step: 'awaiting_media_selection' as const }

    const result = await selectMedia(client, 1, { state, tmdbId: 999 })

    expect(result).toEqual(state)
    expect(editMessageTextMock).not.toHaveBeenCalled()
  })

  test('should return awaiting_language state when tmdbId is found', async () => {
    await db.insert(mediaTable).values(makeMedia(3))
    const state = { mediaType: 'movie' as const, messageId: 42, page: 0, step: 'awaiting_media_selection' as const }

    const result = await selectMedia(client, 1, { state, tmdbId: 2 })

    expect(result).toEqual({ mediaType: 'movie', messageId: 42, step: 'awaiting_language', tmdbId: 2 })
    expect(editMessageTextMock).toHaveBeenCalledWith(
      1,
      42,
      expect.objectContaining({
        replyMarkup: expect.objectContaining({ inline_keyboard: expect.any(Array) }),
        text: 'Which language do you want to set for Media 2?',
      })
    )
  })
})

describe('selectLanguage', () => {
  const client = container.resolve(TOKENS.TELEGRAM_CLIENT)
  beforeEach(() => {
    editMessageTextMock.mockReset()
  })

  test('should update preferred language in db, edit message, and return idle state', async () => {
    await db.insert(mediaTable).values({ originalLanguage: 'en', preferredLanguage: 'en', title: 'Test Movie', tmdbId: 1, type: 'movie' })
    const state = { mediaType: 'movie' as const, messageId: 42, step: 'awaiting_language' as const, tmdbId: 1 }

    const result = await selectLanguage(client, 1, { lang: 'fr', state })

    expect(result).toEqual({ step: 'idle' })
    expect(editMessageTextMock).toHaveBeenCalledWith(1, 42, { text: 'Language updated to fr' })
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
