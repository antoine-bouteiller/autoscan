import type { Conversation } from '@grammyjs/conversations'
import type { MessageXFragment } from '@grammyjs/hydrate/out/data/message'
import { describe, expect, test, vi } from 'vitest'

import type { Media } from '@/database/schema'
import { createMenu } from '@/services/telegram.service'
import type { ConfigureLanguageContext, TelegramContext } from '@/types/telegram'

const makeMedia = (n: number): Media[] =>
  Array.from({ length: n }, (_, i) => ({
    tmdbId: i + 1,
    title: `Media ${i + 1}`,
    type: 'movie',
    originalLanguage: 'en' as const,
    preferredLanguage: 'en' as const,
  }))

const makeMockMenu = () => ({
  dynamic: vi.fn().mockReturnThis(),
  back: vi.fn().mockReturnThis(),
  submenu: vi.fn().mockReturnThis(),
})

const makeMockConversation = (menus: ReturnType<typeof makeMockMenu>[] = []) => {
  let menuFn = vi.fn().mockImplementation(makeMockMenu)

  for (const menu of menus) {
    menuFn = menuFn.mockReturnValueOnce(menu)
  }

  // oxlint-disable-next-line  no-unsafe-type-assertion
  return { menu: menuFn } as unknown as Conversation<TelegramContext, ConfigureLanguageContext>
}

// oxlint-disable-next-line  no-unsafe-type-assertion
const mockedMessage = {} as MessageXFragment

describe('TelegramService', () => {
  describe('createMenu', () => {
    test('creates menu with correct id for page 0', () => {
      const conversation = makeMockConversation()

      createMenu({
        mediaType: 'movie',
        menuConversation: conversation,
        menuMedia: makeMedia(5),
        message: mockedMessage,
        page: 0,
      })

      // oxlint-disable-next-line  no-unbound-method
      expect(conversation.menu).toHaveBeenCalledWith('menu-0', { parent: undefined })
    })

    test('creates menu with correct id and parent for page > 0', () => {
      const conversation = makeMockConversation()

      createMenu({
        mediaType: 'movie',
        menuConversation: conversation,
        menuMedia: makeMedia(5),
        message: mockedMessage,
        page: 2,
      })

      // oxlint-disable-next-line  no-unbound-method
      expect(conversation.menu).toHaveBeenCalledWith('menu-2', { parent: 'menu-1' })
    })

    test('does not add Previous button on page 0', () => {
      const menu = makeMockMenu()
      const conversation = makeMockConversation([menu])

      createMenu({
        mediaType: 'movie',
        menuConversation: conversation,
        menuMedia: makeMedia(5),
        message: mockedMessage,
        page: 0,
      })

      expect(menu.back).not.toHaveBeenCalled()
    })

    test('adds Previous button on page > 0', () => {
      const menu = makeMockMenu()
      const conversation = makeMockConversation([menu])

      createMenu({
        mediaType: 'movie',
        menuConversation: conversation,
        menuMedia: makeMedia(5),
        message: mockedMessage,
        page: 1,
      })

      expect(menu.back).toHaveBeenCalledWith('Previous')
    })

    test('does not add Next submenu when 10 or fewer items', () => {
      const conversation = makeMockConversation()
      const menu = makeMockMenu()

      createMenu({
        mediaType: 'movie',
        menuConversation: conversation,
        menuMedia: makeMedia(10),
        message: mockedMessage,
        page: 0,
      })

      expect(menu.submenu).not.toHaveBeenCalled()
    })

    test('adds Next submenu when more than 10 items', () => {
      const firstMenu = makeMockMenu()
      const secondMenu = makeMockMenu()
      const conversation = makeMockConversation([firstMenu, secondMenu])

      createMenu({
        mediaType: 'movie',
        menuConversation: conversation,
        menuMedia: makeMedia(15),
        message: mockedMessage,
        page: 0,
      })

      expect(firstMenu.submenu).toHaveBeenCalledWith('Next', secondMenu)
    })

    test('returns the created menu', () => {
      const menu = makeMockMenu()
      const conversation = makeMockConversation([menu])

      const result = createMenu({
        mediaType: 'movie',
        menuConversation: conversation,
        menuMedia: makeMedia(5),
        message: mockedMessage,
        page: 0,
      })

      expect(result).toBe(menu)
    })
  })
})
