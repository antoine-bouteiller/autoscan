import { describe, expect, test } from 'bun:test'

import { makeTestLayer } from '@tests/effect'
import { Effect, Fiber, Layer } from 'effect'
import { adjust, layer, type TestClock } from 'effect/testing/TestClock'

import env from '@/config/env'
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
  Effect.runPromise(testEffect.pipe(Effect.provide(makeTestLayer({ telegram: client }).pipe(Layer.provideMerge(layer()))), Effect.scoped))

describe('TelegramProvider', () => {
  test('uses a five-second retry delay and is interruptible', async () => {
    const client = new PollClient()
    client.updates = Effect.fail(new NetworkError({ originalMessage: 'offline', serviceName: 'Telegram' }))
    const provider = new TelegramProvider(client)

    await runControlled(
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

  test('advances the offset after an update', async () => {
    const client = new PollClient()
    let call = 0
    client.updates = Effect.suspend(() => {
      call++
      return call === 1 ? Effect.succeed([{ message: { chat: { id: env.TELEGRAM_CHAT_ID }, message_id: 1 }, update_id: 7 }]) : Effect.never
    })
    const provider = new TelegramProvider(client)

    await runControlled(
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

  test('observes handler failures without terminating polling', async () => {
    const client = new PollClient()
    let call = 0
    client.updates = Effect.suspend(() => {
      call++
      return call === 1
        ? Effect.succeed([{ message: { chat: { id: env.TELEGRAM_CHAT_ID }, message_id: 1, text: '/fail' }, update_id: 1 }])
        : Effect.never
    })
    const provider = new TelegramProvider(client)
    provider.registerCommand('/fail', () => Effect.fail(new NetworkError({ originalMessage: 'failed', serviceName: 'Handler' })))

    await runControlled(
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
})
