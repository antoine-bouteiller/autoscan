import type { HttpProvider } from '@/providers/http_provider'

import { container, TOKENS } from '@/core/bootstrap'
import { radarrWebhook } from '@/features/arr/radarr/controller'
import { sonarrWebhook } from '@/features/arr/sonarr/controller'
import { transcodeAll } from '@/features/transcode/controller'

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
