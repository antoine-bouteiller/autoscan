import { Cause, Effect, Result } from 'effect'

import env from '@/config/env'
import { type AppRequirements } from '@/core/runtime.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramCallbackQuery, type TelegramMessageIn, type TelegramUpdate } from '@/integrations/telegram/telegram.validator'
import { type ConversationState } from '@/providers/telegram/types'

export type CommandHandler = (client: ITelegramClient, message: TelegramMessageIn) => Effect.Effect<ConversationState, unknown, AppRequirements>

type CallbackHandler = (
  client: ITelegramClient,
  chatId: number,
  params: { state: ConversationState; callback: TelegramCallbackQuery }
) => Effect.Effect<ConversationState, unknown, AppRequirements>

export interface Conversation {
  onCommand: CommandHandler
  onCallback: CallbackHandler
}

export class TelegramProvider {
  private conversationState: ConversationState = { step: 'idle' }
  private readonly commands = new Map<string, CommandHandler>()
  private readonly conversations = new Map<string, Conversation>()
  private activeConversationKey?: string
  private readonly client: ITelegramClient

  constructor(client: ITelegramClient) {
    this.client = client
  }

  registerCommand(command: string, handler: CommandHandler): this {
    this.commands.set(command, handler)
    return this
  }

  registerConversation(command: string, conversation: Conversation): this {
    this.conversations.set(command, conversation)
    return this
  }

  private recoverHandler(effect: Effect.Effect<ConversationState, unknown, AppRequirements>) {
    const provider = this
    return effect.pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause)
        }
        return Effect.gen(function* () {
          provider.conversationState = { step: 'idle' }
          provider.activeConversationKey = undefined
          yield* Effect.logError(cause, 'Telegram')
          yield* provider.client
            .sendMessage(env.TELEGRAM_CHAT_ID, 'An unexpected error occurred')
            .pipe(
              Effect.catchCause((sendCause) =>
                Cause.hasInterruptsOnly(sendCause) ? Effect.failCause(sendCause) : Effect.logError(sendCause, 'Telegram')
              )
            )
          return provider.conversationState
        })
      })
    )
  }

  private handleCancel(chatId: number) {
    if (this.conversationState.step === 'idle') {
      return this.client.sendMessage(chatId, 'No operation in progress').pipe(Effect.asVoid)
    }
    this.conversationState = { step: 'idle' }
    this.activeConversationKey = undefined
    return this.client.sendMessage(chatId, 'Cancelled.').pipe(Effect.asVoid)
  }

  private handleMessage(message: TelegramMessageIn) {
    const provider = this
    return Effect.gen(function* () {
      if (message.text === undefined) {
        return
      }
      const conversation = provider.conversations.get(message.text)
      if (conversation !== undefined) {
        provider.activeConversationKey = message.text
        provider.conversationState = yield* provider.recoverHandler(conversation.onCommand(provider.client, message))
        if (provider.conversationState.step === 'idle') {
          provider.activeConversationKey = undefined
        }
        return
      }
      const handler = provider.commands.get(message.text)
      if (handler !== undefined) {
        provider.conversationState = yield* provider.recoverHandler(handler(provider.client, message))
      }
    })
  }

  private handleCallback(chatId: number, callback: TelegramCallbackQuery) {
    const provider = this
    return Effect.gen(function* () {
      if (provider.activeConversationKey === undefined) {
        return
      }
      const conversation = provider.conversations.get(provider.activeConversationKey)
      if (conversation === undefined) {
        return
      }
      provider.conversationState = yield* provider.recoverHandler(
        conversation.onCallback(provider.client, chatId, { callback, state: provider.conversationState })
      )
      if (provider.conversationState.step === 'idle') {
        provider.activeConversationKey = undefined
      }
    })
  }

  private handleUpdate(update: TelegramUpdate) {
    const provider = this
    return Effect.gen(function* () {
      const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id
      if (chatId !== env.TELEGRAM_CHAT_ID) {
        yield* Effect.logWarning(`Unknown chat sender ${chatId}`).pipe(Effect.annotateLogs('context', ['Telegram']))
        return
      }
      if (update.message?.text === '/cancel') {
        yield* provider.handleCancel(chatId)
      } else if (update.message !== undefined && provider.activeConversationKey === undefined) {
        yield* provider.handleMessage(update.message)
      } else if (update.callback_query !== undefined) {
        yield* provider.handleCallback(chatId, update.callback_query)
      }
    })
  }

  get poll() {
    const provider = this
    return Effect.gen(function* () {
      let offset = 0
      let errorDelay = 5000
      yield* Effect.logInfo('bot started').pipe(Effect.annotateLogs('context', ['Telegram']))

      while (true) {
        const updates = yield* Effect.result(provider.client.getUpdates(offset))
        if (Result.isFailure(updates)) {
          yield* Effect.logError(Cause.fail(updates.failure), 'Telegram')
          yield* Effect.sleep(errorDelay)
          errorDelay = Math.min(errorDelay * 2, 5 * 60 * 1000)
          continue
        }

        errorDelay = 5000
        for (const update of updates.success) {
          offset = update.update_id + 1
          yield* provider.handleUpdate(update)
        }
      }
    }).pipe(Effect.ensuring(Effect.logInfo('bot stopped').pipe(Effect.annotateLogs('context', ['Telegram']))))
  }
}
