import { setLanguageConversation } from '@/controllers/language.controller'
import { container, TOKENS } from '@/core/container'
import type { TelegramProvider } from '@/providers/telegram_provider'

container.resolve<TelegramProvider>(TOKENS.TELEGRAM_PROVIDER).registerConversation('/setlanguage', setLanguageConversation)
