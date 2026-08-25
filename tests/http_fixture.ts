import { makeTestContext, runTest, TestLoggerLive } from '@tests/effect'
import { testEnv } from '@tests/env'
import { MockTelegramClient } from '@tests/utils'
import { Effect } from 'effect'

import { registerFeatures } from '@/core/feature'
import { sendMessageFeature } from '@/features/send_message/feature'
import { transcodingFeature } from '@/features/transcoding/feature'
import { HttpProvider, type InjectOptions } from '@/providers/http/http.provider'
import { SchedulerProvider } from '@/providers/scheduler/scheduler.provider'
import { TelegramProvider } from '@/providers/telegram/telegram.provider'

const provider = new HttpProvider()
const runPromise: ConstructorParameters<typeof SchedulerProvider>[0]['runPromise'] = (effect) => runTest(effect)

registerFeatures([transcodingFeature, sendMessageFeature], {
  http: provider,
  scheduler: new SchedulerProvider({ cron: () => ({ stop: () => undefined }), runPromise }),
  telegram: new TelegramProvider(new MockTelegramClient(), testEnv.TELEGRAM_CHAT_ID),
})

export const http = {
  inject: (options: InjectOptions) =>
    Effect.gen(function* () {
      const context = yield* makeTestContext()
      return yield* provider.inject(options, context)
    }).pipe(Effect.scoped, Effect.provide(TestLoggerLive)),
}
