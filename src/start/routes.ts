import { radarrWebhook, sonarrWebhook } from '@/features/arr'
import { transcodeAll } from '@/features/transcode'
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
