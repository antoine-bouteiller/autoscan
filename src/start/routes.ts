import { radarrWebhook } from '@/features/arr/radarr/controller'
import { sonarrWebhook } from '@/features/arr/sonarr/controller'
import { transcodeAll } from '@/features/transcode/controller'
import { getHttpProvider } from '@/providers/http_provider'

getHttpProvider().registerRoutes({
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
