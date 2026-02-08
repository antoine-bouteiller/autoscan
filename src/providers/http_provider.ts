import type { Middleware } from '@/core/middleware/types'

import { logger } from '@/config/logger'
import { compose } from '@/core/middleware/compose'
import { logError } from '@/utils/error_handler'

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
  private readonly middlewares: Middleware[] = []
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

  use(middleware: Middleware): this {
    this.middlewares.push(middleware)
    return this
  }

  registerRoutes(routes: RouteConfig): void {
    this.routes = routes
  }

  start(): ReturnType<typeof Bun.serve> {
    if (this.server) {
      logger.warn('server is already running', 'HTTP')
      return this.server
    }

    const wrappedRoutes = this.wrapRoutesWithMiddleware()

    this.server = Bun.serve({
      error(error) {
        logError(error)
        return new Response('Internal Server Error', {
          status: 500,
        })
      },
      hostname: this.options.hostname,
      port: this.options.port,
      routes: wrappedRoutes,
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

  private wrapRoutesWithMiddleware(): RouteConfig {
    if (this.middlewares.length === 0) {
      return this.routes
    }

    const pipeline = compose(this.middlewares)
    const wrappedRoutes: RouteConfig = {}

    for (const [path, methods] of Object.entries(this.routes)) {
      wrappedRoutes[path] = {}
      for (const [method, handler] of Object.entries(methods)) {
        if (handler) {
          // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
          const methodKey = method as keyof (typeof wrappedRoutes)[string]
          wrappedRoutes[path][methodKey] = (request: Request) => {
            const ctx = { request, state: {} }
            return pipeline(ctx, async () => handler(request))
          }
        }
      }
    }

    return wrappedRoutes
  }
}
