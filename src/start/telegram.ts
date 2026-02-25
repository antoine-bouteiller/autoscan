import { setLanguageConversation } from '@/controllers/language.controller'
import { syncTraktCommand, traktAuthCommand } from '@/controllers/trakt.controller'
import { transcodeCommand } from '@/controllers/transcode.controller'
import { container, TOKENS } from '@/core/container'
import type { TelegramProvider } from '@/providers/telegram_provider'

const telegramProvider = container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER)

telegramProvider.registerConversation('/setlanguage', setLanguageConversation)
telegramProvider.registerCommand('/trakt', traktAuthCommand)
telegramProvider.registerCommand('/synctrakt', syncTraktCommand)
telegramProvider.registerCommand('/transcode', transcodeCommand)
