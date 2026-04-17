import { container, TOKENS } from '#core/container'
import { type HttpProvider } from '#providers/http/http.provider'

import { sendMessageValidator } from './validators/send_message.validator.js'
import { sendMessageWebhook } from './webhooks/send_message.webhook.js'

export const registerSendMessage = () => {
  const http = container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)

  http.post('/send_message', sendMessageValidator, sendMessageWebhook)
}
