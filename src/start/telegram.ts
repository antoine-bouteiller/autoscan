import { container, TOKENS } from '@/core/container'
import type { TelegramProvider } from '@/providers/telegram_provider'
import { setLanguageConversation } from '@/telegram/language.command'
import { syncTraktCommand, traktAuthCommand } from '@/telegram/trakt.command'
import { transcodeCommand } from '@/telegram/transcode.command'

const telegramProvider = container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER)

telegramProvider.registerConversation('/setlanguage', setLanguageConversation)
telegramProvider.registerCommand('/trakt', traktAuthCommand)
telegramProvider.registerCommand('/synctrakt', syncTraktCommand)
telegramProvider.registerCommand('/transcode', transcodeCommand)
