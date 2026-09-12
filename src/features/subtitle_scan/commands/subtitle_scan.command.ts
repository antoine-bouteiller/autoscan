import { Effect } from 'effect'

import { startSubtitleScan } from '@/features/subtitle_scan/jobs/subtitle_scan.job'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type TelegramMessageIn } from '@/integrations/telegram/telegram.validator'

export const subtitleScanCommand = (client: ITelegramClient, message: TelegramMessageIn) =>
  Effect.gen(function* () {
    const started = yield* startSubtitleScan
    yield* client.sendMessage(message.chat.id, started ? 'Starting subtitle scan...' : 'A subtitle scan is already running.')
    return { step: 'idle' } as const
  })
