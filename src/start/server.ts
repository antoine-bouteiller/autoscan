import { radarrWebhook } from '@/app/controllers/radarr_controller'
import { sonarrWebhook } from '@/app/controllers/sonarr_controller'
import { transcodeAll } from '@/app/controllers/transcode_controller'

export const server = Bun.serve({
  routes: {
    '/api/status': {
      POST: (request) => radarrWebhook(request),
    },
    '/sonarr': {
      POST: (request) => sonarrWebhook(request),
    },
    '/transcode/all': {
      POST: (request) => transcodeAll(request),
    },
  },
})
