import type { ITelegramClient } from '@/integrations/telegram.service'
import { getTranscodingStatus, runTranscodeProcess } from '@/jobs/transcode.job'
import type { ConversationState } from '@/types/telegram'
import type { TelegramMessageIn } from '@/validators/telegram.validator'

export const transcodeCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  if (getTranscodingStatus()) {
    await client.sendMessage(message.chat.id, 'Transcode process is already running.')
    return { step: 'idle' }
  }

  await client.sendMessage(message.chat.id, 'Starting transcode process...')
  void runTranscodeProcess()

  return { step: 'idle' }
}
