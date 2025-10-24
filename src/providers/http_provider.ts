import { handleError } from '@/app/exceptions/handler'
import { logger } from '@/config/logger'

type RouteConfig = Record<
  string,
  {
    DELETE?: (request: Request) => Promise<Response> | Response
    GET?: (request: Request) => Promise<Response> | Response
    PATCH?: (request: Request) => Promise<Response> | Response
    POST?: (request: Request) => Promise<Response> | Response
    PUT?: (request: Request) => Promise<Response> | Response
  }
>

interface HttpProviderOptions {
  port?: number
  hostname?: string
}

class HttpProvider {
  private options: HttpProviderOptions
  private server: ReturnType<typeof Bun.serve> | undefined = undefined
  private routes: RouteConfig = {}

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
      logger.warn('HTTP server is already running')
      return this.server
    }

    this.server = Bun.serve({
      error(error) {
        handleError(error)
        return new Response('Internal Server Error', {
          status: 500,
        })
      },
      hostname: this.options.hostname,
      port: this.options.port,
      routes: this.routes,
    })

    logger.info(`HTTP server running at ${this.server.url}`)

    return this.server
  }

  stop(): void {
    if (this.server) {
      this.server.stop()
      logger.info('HTTP server stopped')
      this.server = undefined
    }
  }
}

let httpProvider: HttpProvider | undefined

export const getHttpProvider = (): HttpProvider => {
  if (!httpProvider) {
    httpProvider = new HttpProvider({ port: 3030 })
  }
  return httpProvider
}
