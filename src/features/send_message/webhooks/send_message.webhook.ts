import { Effect } from 'effect'
import { type z } from 'zod'

import env from '@/config/env'
import { Telegram } from '@/core/runtime.service'
import { type sendMessageValidator } from '@/features/send_message/validators/send_message.validator'
import { success } from '@/providers/http/response'
import { type AppReply, type AppRequest } from '@/providers/http/types'

export const sendMessageWebhook = (request: AppRequest<z.infer<typeof sendMessageValidator>>, reply: AppReply) =>
  Effect.gen(function* () {
    const telegram = yield* Telegram
    yield* telegram.sendMessage(env.TELEGRAM_CHAT_ID, request.body.text)
    success(reply, { message: 'ok' })
  })
