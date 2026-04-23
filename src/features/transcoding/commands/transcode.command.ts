import { getTranscodingStatus, runTranscodeProcess } from '#/features/transcoding/jobs/transcode.job'
import { type ITelegramClient } from '#/integrations/telegram/telegram.service'
import { type TelegramMessageIn } from '#/integrations/telegram/telegram.validator'
import { type ConversationState } from '#/providers/telegram/types'

export const transcodeCommand = async (client: ITelegramClient, message: TelegramMessageIn): Promise<ConversationState> => {
  if (getTranscodingStatus()) {
    await client.sendMessage(message.chat.id, 'Transcode process is already running.')
    return { step: 'idle' }
  }

  await client.sendMessage(message.chat.id, 'Starting transcode process...')
  void runTranscodeProcess()

  return { step: 'idle' }
}
