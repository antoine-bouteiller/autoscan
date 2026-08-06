import { Effect } from 'effect'

import { startTranscodeProcess } from '@/features/transcoding/jobs/transcode.job'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'

export const transcodeCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  Effect.gen(function* () {
    const started = yield* startTranscodeProcess
    yield* client.sendMessage(message.chat.id, started ? 'Starting transcode process...' : 'Transcode process is already running.')
    return { step: 'idle' } as const
  })
