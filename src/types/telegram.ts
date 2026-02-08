import type { Conversation, ConversationFlavor } from '@grammyjs/conversations'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { Context } from 'grammy'

export type ConfigureLanguageContext = HydrateFlavor<Context>

export type ConfigureLanguageConversation = Conversation<TelegramContext, ConfigureLanguageContext>

export type TelegramContext = ConversationFlavor<Context>
