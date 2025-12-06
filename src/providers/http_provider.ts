import { logger } from '@/config/logger'
import { handleError } from '@/utils/error_handler'

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
  hostname?: string
  port?: number
}

class HttpProvider {
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
        handleError(error)
        return new Response('Internal Server Error', {
          status: 500,
        })
      },
      hostname: this.options.hostname,
      port: this.options.port,
      routes: this.routes,
    })

    logger.info(`Server running at ${this.server.url}`, 'HTTP')

    return this.server
  }

  stop(): void {
    if (this.server) {
      this.server.stop()
      logger.info('Server stopped', 'HTTP')
      this.server = undefined
    }
  }
}

let httpProvider: HttpProvider | undefined

export const getHttpProvider = (): HttpProvider => {
  httpProvider ??= new HttpProvider({ port: 3030 })
  return httpProvider
}
