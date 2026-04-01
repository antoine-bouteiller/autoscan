import { radarrWebhook } from '#controllers/radarr.controller'
import { sonarrWebhook } from '#controllers/sonarr.controller'
import { sendMessageWebhook } from '#controllers/telegram.controller'
import { container, TOKENS } from '#core/container'
import { type HttpProvider } from '#providers/http_provider'

const { app } = container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)

app.post('/radarr', radarrWebhook)
app.post('/send-message', sendMessageWebhook)
app.post('/sonarr', sonarrWebhook)
