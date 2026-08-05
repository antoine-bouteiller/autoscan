import { runTest } from '@tests/effect'
import { MockTelegramClient } from '@tests/utils'

import { registerFeatures } from '@/core/feature'
import { sendMessageFeature } from '@/features/send_message/feature'
import { transcodingFeature } from '@/features/transcoding/feature'
import { HttpProvider } from '@/providers/http/http.provider'
import { SchedulerProvider } from '@/providers/scheduler/scheduler.provider'
import { TelegramProvider } from '@/providers/telegram/telegram.provider'

const runPromise: ConstructorParameters<typeof HttpProvider>[0]['runPromise'] = (effect) => runTest(effect)

export const http = new HttpProvider({ runPromise })
registerFeatures([transcodingFeature, sendMessageFeature], {
  http,
  scheduler: new SchedulerProvider({ cron: () => ({ stop: () => undefined }), runPromise }),
  telegram: new TelegramProvider(new MockTelegramClient()),
})
