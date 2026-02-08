import type { HttpProvider } from '@/providers/http_provider'

import { radarrWebhook } from '@/controllers/radarr.controller'
import { sonarrWebhook } from '@/controllers/sonarr.controller'
import { transcodeAll } from '@/controllers/transcode.controller'
import { container, TOKENS } from '@/core/bootstrap'

container.resolve<HttpProvider>(TOKENS.HTTP_PROVIDER).registerRoutes({
  '/radarr': {
    POST: (request: Request) => radarrWebhook(request),
  },
  '/sonarr': {
    POST: (request: Request) => sonarrWebhook(request),
  },
  '/transcode/all': {
    POST: (request: Request) => transcodeAll(request),
  },
})
