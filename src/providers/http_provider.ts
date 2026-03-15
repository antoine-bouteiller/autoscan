import fastify from 'fastify'

import { logger } from '#config/logger'
import { logError } from '#utils/error'

interface HttpProviderOptions {
  hostname?: string
  port?: number
}

export class HttpProvider {
  readonly app = fastify()
  private readonly options: HttpProviderOptions

  constructor(options: HttpProviderOptions) {
    this.options = {
      hostname: '0.0.0.0',
      port: 3030,
      ...options,
    }

    this.app.setErrorHandler((error, _request, reply) => {
      logError(error)
      reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        meta: { timestamp: new Date().toISOString() },
        success: false,
      })
    })
  }

  async start(): Promise<void> {
    await this.app.listen({ host: this.options.hostname, port: this.options.port })
    logger.info(`Server running at http://${this.options.hostname}:${this.options.port}/`, 'HTTP')
  }

  async stop(): Promise<void> {
    await this.app.close()
    logger.info('Server stopped', 'HTTP')
  }
}
