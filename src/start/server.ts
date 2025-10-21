import fastify from 'fastify'

import { handleError } from '@/app/exceptions/handler'
import { logger } from '@/config/logger'
import { radarrWebhook } from '@/app/controllers/radarr_controller'
import { sonarrWebhook } from '@/app/controllers/sonarr_controller'
import { transcodeAll } from '@/app/controllers/transcode_controller'

const app = fastify()

app.post('/sonarr', sonarrWebhook)

app.post('/radarr', radarrWebhook)

app.post('/transcode/all', transcodeAll)

app.setErrorHandler((error, _request, reply) => {
  handleError(error)
  reply.status(500).send({ message: 'Internal Server Error', statusCode: 500 })
})

await app
  .listen({ host: '0.0.0.0', port: 3030 })
  .then(() => {
    logger.info('Webserver started on port 3030')
  })
  .catch(() => {
    logger.error('Failed to start webserver on port 3030')
    process.exit(1)
  })
