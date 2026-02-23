import { describe, expect, test } from 'vitest'

import type { Media } from '@/database/schema'
import { buildLanguageKeyboard, buildMediaKeyboard } from '@/services/language.service'
import { iso1ToIso2T } from '@/types/iso_codes'

const makeMedia = (n: number): Media[] =>
  Array.from({ length: n }, (_, i) => ({
    tmdbId: i + 1,
    title: `Media ${i + 1}`,
    type: 'movie',
    originalLanguage: 'en' as const,
    preferredLanguage: 'en' as const,
  }))

describe('buildMediaKeyboard', () => {
  test('5 items on page 0: 5 buttons, no nav', () => {
    const keyboard = buildMediaKeyboard(makeMedia(5), 0)
    expect(keyboard.inline_keyboard).toHaveLength(5)
    const allButtons = keyboard.inline_keyboard.flat()
    expect(allButtons.some((b) => b.callback_data.startsWith('page:'))).toBe(false)
  })

  test('15 items on page 0: 10 buttons + Next', () => {
    const keyboard = buildMediaKeyboard(makeMedia(15), 0)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((b) => b.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(10)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((b) => b.callback_data === 'page:1')).toBe(true)
    expect(navRow?.some((b) => b.callback_data === 'page:-1')).toBe(false)
  })

  test('15 items on page 1: 5 buttons + Previous, no Next', () => {
    const keyboard = buildMediaKeyboard(makeMedia(15), 1)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((b) => b.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(5)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((b) => b.callback_data === 'page:0')).toBe(true)
    expect(navRow?.some((b) => b.callback_data === 'page:2')).toBe(false)
  })

  test('25 items on page 1: 10 buttons + Previous + Next', () => {
    const keyboard = buildMediaKeyboard(makeMedia(25), 1)
    const mediaRows = keyboard.inline_keyboard.filter((row) => row.every((b) => b.callback_data.startsWith('select_media:')))
    expect(mediaRows).toHaveLength(10)
    const navRow = keyboard.inline_keyboard[keyboard.inline_keyboard.length - 1]
    expect(navRow?.some((b) => b.callback_data === 'page:0')).toBe(true)
    expect(navRow?.some((b) => b.callback_data === 'page:2')).toBe(true)
  })
})

describe('buildLanguageKeyboard', () => {
  test('rows have at most 6 buttons each', () => {
    const keyboard = buildLanguageKeyboard()
    for (const row of keyboard.inline_keyboard) {
      expect(row.length).toBeLessThanOrEqual(6)
    }
  })

  test('all ISO 639-1 codes are present', () => {
    const keyboard = buildLanguageKeyboard()
    const allCodes = keyboard.inline_keyboard.flat().map((b) => b.callback_data.slice('lang:'.length))
    const expectedCodes = Object.keys(iso1ToIso2T)
    expect(allCodes.toSorted()).toEqual(expectedCodes.toSorted())
  })
})
