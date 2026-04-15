import { radarrWebhook } from '#controllers/radarr.controller'
import { sonarrWebhook } from '#controllers/sonarr.controller'
import { sendMessageWebhook } from '#controllers/telegram.controller'
import { container, TOKENS } from '#core/container'
import { success } from '#core/response'
import { type HttpProvider } from '#providers/http_provider'

const { app } = container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER)

app.post('/radarr', radarrWebhook)
app.post('/send-message', sendMessageWebhook)
app.post('/sonarr', sonarrWebhook)

app.get('/debug/memory', (_request, reply) => {
  const mem = process.memoryUsage()
  return success(reply, {
    arrayBuffers: `${Math.round(mem.arrayBuffers / 1024 / 1024)}MB`,
    external: `${Math.round(mem.external / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
  })
})
