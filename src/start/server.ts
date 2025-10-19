import Fastify from 'fastify'

import { radarrWebhook } from '@/app/controllers/radarr_controller'
import { sonarrWebhook } from '@/app/controllers/sonarr_controller'
import { transcodeAll } from '@/app/controllers/transcode_controller'
import { handleError } from '@/app/exceptions/handler'
import { logger } from '@/config/logger'

const fastify = Fastify()

fastify.post('/sonarr', sonarrWebhook)

fastify.post('/radarr', radarrWebhook)

fastify.post('/transcode/all', transcodeAll)

fastify.setErrorHandler((error, _, reply) => {
  handleError(error)
  reply.status(500).send({ message: 'Internal Server Error', statusCode: 500 })
})

fastify
  .listen({ host: '0.0.0.0', port: 3030 })
  .then(() => {
    logger.info('Webserver started on port 3030')
  })
  .catch(() => {
    logger.error('Failed to start webserver on port 3030')
    process.exit(1)
  })
