import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Exit, Result, Schema, Scope } from 'effect'
import { HttpRouter, HttpServer, type HttpServerRequest, HttpServerResponse } from 'effect/unstable/http'

import { logger } from '@/config/logger'
import { type AppRequirements } from '@/core/runtime.service'
import { badRequest } from '@/providers/http/response'
import { type AppReply, type AppRequest, type RouteHandler } from '@/providers/http/types'
import { logError } from '@/shared/utils/error'
import { formatSchemaIssue } from '@/shared/utils/schema'

interface HttpProviderOptions {
  hostname?: string
  port?: number
  runPromise: <Success, Error>(effect: Effect.Effect<Success, Error, AppRequirements>) => Promise<Success>
}
type HttpMethod = 'GET' | 'POST'

interface InjectOptions {
  body?: string
  method: HttpMethod
  payload?: unknown
  url: string
}

interface InjectResponseBody {
  data?: unknown
  error?: { code: string; details?: unknown; message: string }
  meta?: { timestamp: string }
  success: boolean
}

interface InjectResponse {
  json: () => InjectResponseBody
  statusCode: number
}

const jsonResponse = (data: unknown, statusCode: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(data, { status: statusCode })

const notFoundRoute = HttpRouter.route('*', '*', jsonResponse({ error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }, 404))
const routerConfig = { caseSensitive: true, ignoreTrailingSlash: false }
export class HttpProvider {
  private readonly options: Required<Omit<HttpProviderOptions, 'runPromise'>>
  private readonly routes: HttpRouter.Route[] = []
  private readonly runPromise: HttpProviderOptions['runPromise']
  private serverScope?: Scope.Closeable

  constructor(options: HttpProviderOptions) {
    this.options = { hostname: options.hostname ?? '0.0.0.0', port: options.port ?? 3030 }
    this.runPromise = options.runPromise
  }

  get(path: HttpRouter.PathInput, handler: RouteHandler): void {
    this.register('GET', path, handler)
  }

  post<TSchema extends Schema.ConstraintDecoder<unknown>>(
    path: HttpRouter.PathInput,
    validator: TSchema,
    handler: RouteHandler<TSchema['Type']>
  ): void {
    this.register('POST', path, (request: AppRequest, reply: AppReply) => {
      const result = Schema.decodeUnknownResult(validator, { errors: 'all' })(request.body)
      if (Result.isFailure(result)) {
        return Effect.sync(() => {
          const details = formatSchemaIssue(result.failure.issue)
          logError(details, path)
          badRequest(reply, 'invalid request', details)
        })
      }
      return handler({ body: result.success }, reply)
    })
  }

  async inject(options: InjectOptions): Promise<InjectResponse> {
    const webHandler = HttpRouter.toWebHandler(HttpRouter.addAll([...this.routes, notFoundRoute]), {
      disableLogger: true,
      routerConfig,
    })
    try {
      const response = await webHandler.handler(
        new Request(`http://localhost${options.url}`, {
          body: options.body ?? (options.payload === undefined ? undefined : JSON.stringify(options.payload)),
          headers: { 'content-type': 'application/json' },
          method: options.method,
        })
      )
      const body: InjectResponseBody = JSON.parse(await response.text())
      return { json: () => body, statusCode: response.status }
    } finally {
      await webHandler.dispose()
    }
  }

  private register(method: HttpMethod, path: HttpRouter.PathInput, handler: RouteHandler): void {
    this.routes.push(HttpRouter.route(method, path, (request) => this.execute(handler, request)))
  }

  private execute(handler: RouteHandler, request: HttpServerRequest.HttpServerRequest): Effect.Effect<HttpServerResponse.HttpServerResponse> {
    const provider = this
    return Effect.gen(function* () {
      const appRequest: AppRequest = { body: undefined }
      if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
        const body = yield* Effect.result(request.text.pipe(Effect.flatMap((raw) => Effect.try(() => (raw ? JSON.parse(raw) : undefined)))))
        if (Result.isFailure(body)) {
          return jsonResponse({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' }, success: false }, 400)
        }
        appRequest.body = body.success
      }

      let statusCode = 200
      let payload: unknown
      const reply: AppReply = {
        send(data: unknown) {
          payload = data
        },
        status(code: number) {
          statusCode = code
          return this
        },
      }

      const result = yield* Effect.result(Effect.tryPromise(() => provider.runPromise(handler(appRequest, reply))))
      if (Result.isFailure(result)) {
        yield* Effect.sync(() => logError(result.failure))
        return jsonResponse(
          {
            error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
            meta: { timestamp: new Date().toISOString() },
            success: false,
          },
          500
        )
      }
      return jsonResponse(payload, statusCode)
    })
  }

  get start() {
    const provider = this
    return Effect.gen(function* () {
      if (provider.serverScope !== undefined) {
        return
      }
      const scope = yield* Scope.make()
      provider.serverScope = scope
      const server = yield* BunHttpServer.make({
        gracefulShutdownTimeout: 30_000,
        hostname: provider.options.hostname,
        port: provider.options.port,
      }).pipe(Scope.provide(scope))
      const router = yield* HttpRouter.make.pipe(Effect.provideService(HttpRouter.RouterConfig, routerConfig))
      yield* router.addAll([...provider.routes, notFoundRoute])
      yield* server.serve(router.asHttpEffect()).pipe(Scope.provide(scope))
      logger.info(`Server running at ${HttpServer.formatAddress(server.address)}/`, 'HTTP')
    })
  }

  get stop() {
    const provider = this
    return Effect.gen(function* () {
      const scope = provider.serverScope
      if (scope === undefined) {
        return
      }
      provider.serverScope = undefined
      yield* Scope.close(scope, Exit.void)
      logger.info('Server stopped', 'HTTP')
    })
  }
}
