import { radarrWebhook } from '@/controllers/radarr.controller'
import { sendMessageWebhook } from '@/controllers/telegram.controller'
import { sonarrWebhook } from '@/controllers/sonarr.controller'
import { container, TOKENS } from '@/core/container'
import type { HttpProvider } from '@/providers/http_provider'

container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER).registerRoutes({
  '/radarr': {
    POST: (request: Request) => radarrWebhook(request),
  },
  '/send-message': {
    POST: (request: Request) => sendMessageWebhook(request),
  },
  '/sonarr': {
    POST: (request: Request) => sonarrWebhook(request),
  },
})
