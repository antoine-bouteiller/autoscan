import type { FastifyReply, FastifyRequest } from 'fastify'
import * as v from 'valibot'

import env from '#config/env'
import { container, TOKENS } from '#core/container'
import { badRequest, success } from '#core/response'
import type { ITelegramClient } from '#integrations/telegram.service'
import { logError } from '#utils/error'
import { sendMessageValidator } from '#validators/send_message.validator'

export const sendMessageWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = v.safeParse(sendMessageValidator, request.body)

  if (!parsed.success) {
    logError(parsed.issues, 'Telegram')
    return badRequest(reply, 'invalid request', v.flatten(parsed.issues))
  }

  const telegram = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  await telegram.sendMessage(env.TELEGRAM_CHAT_ID, parsed.output.text)

  return success(reply, { message: 'ok' })
}
