import { type z } from 'zod'

import env from '#config/env'
import { container, TOKENS } from '#core/container'
import { type sendMessageValidator } from '#features/send_message/validators/send_message.validator'
import { success } from '#providers/http/response'
import { type AppReply, type AppRequest } from '#providers/http/types'

export const sendMessageWebhook = async (request: AppRequest<z.infer<typeof sendMessageValidator>>, reply: AppReply) => {
  const telegram = container.resolve(TOKENS.TELEGRAM_CLIENT)
  await telegram.sendMessage(env.TELEGRAM_CHAT_ID, request.body.text)

  return success(reply, { message: 'ok' })
}
