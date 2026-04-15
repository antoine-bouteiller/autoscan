import { z } from 'zod'

import env from '#config/env'
import { container, TOKENS } from '#core/container'
import { badRequest, success } from '#core/response'
import { type ITelegramClient } from '#integrations/telegram.service'
import { type AppReply, type AppRequest } from '#types/http'
import { logError } from '#utils/error'
import { sendMessageValidator } from '#validators/send_message.validator'

export const sendMessageWebhook = async (request: AppRequest, reply: AppReply) => {
  const parsed = sendMessageValidator.safeParse(request.body)

  if (!parsed.success) {
    logError(parsed.error.issues, 'Telegram')
    return badRequest(reply, 'invalid request', z.treeifyError(parsed.error))
  }

  const telegram = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  await telegram.sendMessage(env.TELEGRAM_CHAT_ID, parsed.data.text)

  return success(reply, { message: 'ok' })
}
