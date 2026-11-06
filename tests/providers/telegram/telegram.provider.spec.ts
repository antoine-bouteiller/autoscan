import { provideTest } from '@tests/effect'
import { testEnv as env } from '@tests/env'
import { describe, expect, it } from '@tests/it'
import { Effect, Fiber } from 'effect'
import { adjust, type TestClock } from 'effect/testing/TestClock'

import { type AppRequirements } from '@/core/runtime.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramUpdate } from '@/integrations/telegram/telegram.validator'
import { TelegramProvider } from '@/providers/telegram/telegram.provider'
import { NetworkError } from '@/shared/errors/network'

class PollClient implements ITelegramClient {
  readonly messages: string[] = []
  readonly offsets: (number | undefined)[] = []
  updates: Effect.Effect<TelegramUpdate[], NetworkError> = Effect.never

  getUpdates(offset?: number) {
    this.offsets.push(offset)
    return this.updates
  }

  sendMessage(_chatId: number, text: string) {
    this.messages.push(text)
    return Effect.succeed(1)
  }

  editMessageText() {
    return Effect.void
  }

  deleteMessage() {
    return Effect.void
  }

  answerCallbackQuery() {
    return Effect.void
  }
}

const runControlled = (client: PollClient, testEffect: Effect.Effect<void, never, AppRequirements | TestClock>) =>
  provideTest(testEffect, { telegram: client })

describe('TelegramProvider', () => {
  it.effect('uses a five-second retry delay and is interruptible', () => {
    const client = new PollClient()
    client.updates = Effect.fail(NetworkError.make({ originalMessage: 'offline', serviceName: 'Telegram' }))
    const provider = new TelegramProvider(client, env.TELEGRAM_CHAT_ID)

    return runControlled(
      client,
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(provider.poll)
        yield* Effect.yieldNow
        expect(client.offsets).toHaveLength(1)
        yield* adjust(4999)
        expect(client.offsets).toHaveLength(1)
        yield* adjust(1)
        yield* Effect.yieldNow
        expect(client.offsets).toHaveLength(2)
        yield* Fiber.interrupt(fiber)
        yield* adjust('1 hour')
        expect(client.offsets).toHaveLength(2)
      })
    )
  })

  it.effect('advances the offset after an update', () => {
    const client = new PollClient()
    let call = 0
    client.updates = Effect.suspend(() => {
      call++
      return call === 1 ? Effect.succeed([{ message: { chat: { id: env.TELEGRAM_CHAT_ID }, message_id: 1 }, update_id: 7 }]) : Effect.never
    })
    const provider = new TelegramProvider(client, env.TELEGRAM_CHAT_ID)

    return runControlled(
      client,
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(provider.poll)
        yield* Effect.yieldNow
        yield* Effect.yieldNow
        expect(client.offsets).toEqual([0, 8])
        yield* Fiber.interrupt(fiber)
      })
    )
  })

  it.effect('observes handler failures without terminating polling', () => {
    const client = new PollClient()
    let call = 0
    client.updates = Effect.suspend(() => {
      call++
      return call === 1
        ? Effect.succeed([{ message: { chat: { id: env.TELEGRAM_CHAT_ID }, message_id: 1, text: '/fail' }, update_id: 1 }])
        : Effect.never
    })
    const provider = new TelegramProvider(client, env.TELEGRAM_CHAT_ID)
    provider.registerCommand('/fail', () => Effect.fail(NetworkError.make({ originalMessage: 'failed', serviceName: 'Handler' })))

    return runControlled(
      client,
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(provider.poll)
        yield* Effect.yieldNow
        yield* Effect.yieldNow
        expect(client.messages).toEqual(['An unexpected error occurred'])
        expect(client.offsets).toEqual([0, 2])
        yield* Fiber.interrupt(fiber)
      })
    )
  })
  it.effect('dispatches prefixed callbacks to actions during a conversation and contains their failures', () => {
    const client = new PollClient()
    const message = { chat: { id: env.TELEGRAM_CHAT_ID }, message_id: 1 }
    const callback = (update_id: number, data: string) => ({ callback_query: { data, id: String(update_id), message }, update_id })
    let call = 0
    client.updates = Effect.suspend(() => {
      call++
      return call === 1
        ? Effect.succeed([
            { message: { ...message, text: '/talk' }, update_id: 1 },
            callback(2, 'act:a:b'),
            callback(3, 'act:fail'),
            callback(4, 'reply'),
          ])
        : Effect.never
    })
    const payloads: string[] = []
    const conversationCallbacks: (string | undefined)[] = []
    const provider = new TelegramProvider(client, env.TELEGRAM_CHAT_ID)
    provider.registerConversation('/talk', {
      onCallback: (_client, _chatId, { callback: query }) =>
        Effect.sync(() => void conversationCallbacks.push(query.data)).pipe(Effect.as({ step: 'idle' } as const)),
      onCommand: () => Effect.succeed({ messageId: 1, step: 'awaiting_media_type' }),
    })
    provider.registerAction('act', (_client, _callback, payload) =>
      payload === 'fail'
        ? Effect.fail(NetworkError.make({ originalMessage: 'failed', serviceName: 'Action' }))
        : Effect.sync(() => void payloads.push(payload))
    )

    return runControlled(
      client,
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(provider.poll)
        yield* Effect.yieldNow
        yield* Effect.yieldNow
        expect(payloads).toEqual(['a:b'])
        expect(client.messages).toEqual(['An unexpected error occurred'])
        expect(conversationCallbacks).toEqual(['reply'])
        yield* Fiber.interrupt(fiber)
      })
    )
  })
})
