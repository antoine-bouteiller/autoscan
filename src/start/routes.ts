import { radarrWebhook } from '@/app/controllers/http/radarr_controller'
import { sonarrWebhook } from '@/app/controllers/http/sonarr_controller'
import { transcodeAll } from '@/app/controllers/http/transcode_controller'
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
