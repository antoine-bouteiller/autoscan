import { type z } from 'zod'

import env from '#config/env'
import { container, TOKENS } from '#core/container'
import { success } from '#core/response'
import { type ITelegramClient } from '#integrations/telegram.service'
import { type AppReply, type AppRequest } from '#types/http'
import { type sendMessageValidator } from '#validators/send_message.validator'

export const sendMessageWebhook = async (request: AppRequest<z.infer<typeof sendMessageValidator>>, reply: AppReply) => {
  const telegram = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  await telegram.sendMessage(env.TELEGRAM_CHAT_ID, request.body.text)

  return success(reply, { message: 'ok' })
}
