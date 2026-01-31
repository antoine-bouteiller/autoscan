import type { MessageXFragment } from '@grammyjs/hydrate/out/data/message'

import { ConversationMenuRange } from '@grammyjs/conversations'
import { and, eq } from 'drizzle-orm'

import type { MediaType } from '@/integrations/plex/client'

import { db } from '@/config/db'
import { media, type Media } from '@/database/schema'
import { iso1ToIso2T } from '@/types/iso_codes'
import { normalizeToIso1 } from '@/utils/iso_codes'

import type { ConfigureLanguageContext, ConfigureLanguageConversation } from './types'

const handleMediaSelection = async (
  menuConversation: ConfigureLanguageConversation,
  entry: Media,
  message: MessageXFragment,
  mediaType: MediaType
) => {
  await message.editText(`Wich language do you want to set for ${entry.title} ?`)

  const language = await menuConversation.form.select(Object.keys(iso1ToIso2T), {
    action: (ctx) => ctx.deleteMessage(),
    otherwise: (ctx) => ctx.reply('Invalid language code'),
  })

  await menuConversation.external(() =>
    db
      .update(media)
      .set({
        preferredLanguage: normalizeToIso1(language),
      })
      .where(and(eq(media.tmdbId, entry.tmdbId), eq(media.type, mediaType)))
  )

  await message.editText(`Language of ${entry.title} updated to ${language}`)

  await menuConversation.halt()
}

export const createMenu = ({
  mediaType,
  menuConversation,
  menuMedia,
  message,
  page,
}: {
  mediaType: MediaType
  menuConversation: ConfigureLanguageConversation
  menuMedia: Media[]
  message: MessageXFragment
  page: number
}): ReturnType<typeof menuConversation.menu> => {
  const currentMenu = menuMedia.slice(0, 10)

  const nextMenu = menuMedia.slice(10)

  const menuId = `menu-${page}`
  const parentMenuId = page > 0 ? `menu-${page - 1}` : undefined

  const menu = menuConversation.menu(menuId, { parent: parentMenuId })

  menu.dynamic(() =>
    currentMenu.reduce(
      (range, entry) => range.text(entry.title, () => handleMediaSelection(menuConversation, entry, message, mediaType)).row(),
      new ConversationMenuRange<ConfigureLanguageContext>()
    )
  )

  if (page > 0) {
    menu.back('Previous')
  }

  if (nextMenu.length > 0) {
    menu.submenu(
      'Next',
      createMenu({
        mediaType,
        menuConversation,
        menuMedia: nextMenu,
        message,
        page: page + 1,
      })
    )
  }

  return menu
}
