import { radarrWebhook } from '#controllers/radarr.controller'
import { sonarrWebhook } from '#controllers/sonarr.controller'
import { sendMessageWebhook } from '#controllers/telegram.controller'
import { container, TOKENS } from '#core/container'
import { type HttpProvider } from '#providers/http_provider'
import { radarrValidator } from '#validators/radarr.validator'
import { sendMessageValidator } from '#validators/send_message.validator'
import { sonarrValidator } from '#validators/sonarr.validator'

const http = container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)

http.post('/radarr', radarrValidator, radarrWebhook)
http.post('/send-message', sendMessageValidator, sendMessageWebhook)
http.post('/sonarr', sonarrValidator, sonarrWebhook)
