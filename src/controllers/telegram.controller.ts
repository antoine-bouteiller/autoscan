import * as v from 'valibot'

import env from '@/config/env'
import { container, TOKENS } from '@/core/container'
import { badRequest, success } from '@/core/response'
import type { ITelegramClient } from '@/integrations/telegram.service'
import { logError } from '@/utils/error'
import { sendMessageValidator } from '@/validators/send_message.validator'

export const sendMessageWebhook = async (request: Request) => {
  const body = await request.json()
  const parsed = v.safeParse(sendMessageValidator, body)

  if (!parsed.success) {
    logError(parsed.issues, 'Telegram')
    return badRequest('invalid request', v.flatten(parsed.issues))
  }

  const telegram = container.resolve<ITelegramClient>(TOKENS.TELEGRAM_CLIENT)
  await telegram.sendMessage(env.TELEGRAM_CHAT_ID, parsed.output.text)

  return success({ message: 'ok' })
}
