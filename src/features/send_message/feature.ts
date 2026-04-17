import { defineFeature, postRoute } from '#core/feature'

import { sendMessageValidator } from './validators/send_message.validator.js'
import { sendMessageWebhook } from './webhooks/send_message.webhook.js'

export const sendMessageFeature = defineFeature({
  name: 'send_message',
  routes: [postRoute('/send_message', sendMessageValidator, sendMessageWebhook)],
})
