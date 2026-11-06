import { Effect, Path } from 'effect'

import { Env } from '@/config/env'
import { deleteInvalidSubtitle, deleteSubtitleButton, listInvalidSubtitles } from '@/features/subtitle_scan/services/invalid_subtitles.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramCallbackQuery, type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'

export const invalidSubtitlesCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  Effect.gen(function* () {
    const files = yield* listInvalidSubtitles
    if (files.length === 0) {
      yield* client.sendMessage(message.chat.id, 'No invalid subtitles.')
      return { step: 'idle' } as const
    }
    const path = yield* Path.Path
    yield* client.sendMessage(message.chat.id, 'Invalid subtitles (tap to delete through Bazarr):', {
      replyMarkup: { inline_keyboard: files.map((file) => [deleteSubtitleButton(file, `🗑️ ${path.basename(file)}`)]) },
    })
    return { step: 'idle' } as const
  })

export const deleteSubtitleAction = (client: ITelegramClient, callback: TelegramCallbackQuery, key: string) =>
  Effect.gen(function* () {
    yield* client.answerCallbackQuery(callback.id)
    const reply = yield* deleteInvalidSubtitle(key)
    const chatId = callback.message?.chat.id ?? (yield* Env).TELEGRAM_CHAT_ID
    yield* client.sendMessage(chatId, reply)
  })
