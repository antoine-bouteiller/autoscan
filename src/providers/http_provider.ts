import { logger } from '@/config/logger'

import { logError } from '../utils/error'

type RouteHandler = (request: Request) => Promise<Response> | Response

type RouteConfig = Record<
  string,
  {
    DELETE?: RouteHandler
    GET?: RouteHandler
    PATCH?: RouteHandler
    POST?: RouteHandler
    PUT?: RouteHandler
  }
>

interface HttpProviderOptions {
  hostname?: string
  port?: number
}

export class HttpProvider {
  private readonly options: HttpProviderOptions
  private routes: RouteConfig = {}
  private server: ReturnType<typeof Bun.serve> | undefined = undefined

  constructor(options: HttpProviderOptions) {
    this.options = {
      hostname: '0.0.0.0',
      port: 3030,
      ...options,
    }
  }

  registerRoutes(routes: RouteConfig): void {
    this.routes = routes
  }

  start(): ReturnType<typeof Bun.serve> {
    if (this.server) {
      logger.warn('server is already running', 'HTTP')
      return this.server
    }

    this.server = Bun.serve({
      error(error) {
        logError(error)

        return Response.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected error occurred',
            },
            meta: { timestamp: new Date().toISOString() },
            success: false,
          },
          { status: 500 }
        )
      },
      hostname: this.options.hostname,
      port: this.options.port,
      routes: this.routes,
    })

    logger.info(`Server running at ${this.server.url.toString()}`, 'HTTP')

    return this.server
  }

  stop(): void {
    if (this.server) {
      void this.server.stop()
      logger.info('Server stopped', 'HTTP')
      this.server = undefined
    }
  }
}
