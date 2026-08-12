import { BunHttpServer } from '@effect/platform-bun'
import { Cause, type Context, DateTime, Effect, Exit, Result, Schema, Scope } from 'effect'
import { HttpRouter, HttpServer, type HttpServerRequest, HttpServerResponse } from 'effect/unstable/http'

import { type AppRequirements } from '@/core/runtime.service'
import { badRequest } from '@/providers/http/response'
import { type AppReply, type AppRequest, type RouteHandler } from '@/providers/http/types'
import { formatSchemaIssue } from '@/shared/utils/schema'

interface HttpProviderOptions {
  hostname?: string
  port?: number
  server?: Effect.Effect<HttpServer.HttpServer['Service'], never, Scope.Scope>
}
type HttpMethod = 'GET' | 'POST'

export interface InjectOptions {
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

export interface InjectResponse {
  json: () => InjectResponseBody
  statusCode: number
}

const unknownFromJsonString = Schema.fromJsonString(Schema.Unknown)
const encodeJson = Schema.encodeSync(unknownFromJsonString)
const decodeJson = Schema.decodeUnknownResult(unknownFromJsonString)

const jsonResponse = (data: unknown, statusCode: number): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.jsonUnsafe(data, { status: statusCode })

const notFoundRoute = HttpRouter.route('*', '*', jsonResponse({ error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }, 404))
const routerConfig = { caseSensitive: true, ignoreTrailingSlash: false }
const isInterruptedOnly = (cause: Cause.Cause<unknown>): cause is Cause.Cause<never> =>
  cause.reasons.length > 0 && cause.reasons.every(Cause.isInterruptReason)

export class HttpProvider {
  private readonly options: Required<Omit<HttpProviderOptions, 'server'>>
  private readonly routes: HttpRouter.Route<never, AppRequirements>[] = []
  private readonly server?: HttpProviderOptions['server']
  private serverScope?: Scope.Closeable

  constructor(options: HttpProviderOptions = {}) {
    this.options = { hostname: options.hostname ?? '0.0.0.0', port: options.port ?? 3030 }
    this.server = options.server
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
        const details = formatSchemaIssue(result.failure.issue)
        return Effect.logError(details, path).pipe(Effect.andThen(Effect.sync(() => badRequest(reply, 'invalid request', details))))
      }
      return handler({ body: result.success }, reply)
    })
  }

  inject(options: InjectOptions, context: Context.Context<AppRequirements>): Effect.Effect<InjectResponse, Cause.UnknownError> {
    const provider = this
    return Effect.gen(function* () {
      const webHandler = HttpRouter.toWebHandler(provider.routesLayer, { disableLogger: true, routerConfig })
      const signal = yield* Effect.abortSignal
      return yield* Effect.gen(function* () {
        const response = yield* Effect.tryPromise(() =>
          webHandler.handler(
            new Request(`http://localhost${options.url}`, {
              body: options.body ?? (options.payload === undefined ? undefined : encodeJson(options.payload)),
              headers: { 'content-type': 'application/json' },
              method: options.method,
              signal,
            }),
            context
          )
        )
        const text = yield* Effect.tryPromise(() => response.text())
        const decoded = decodeJson(text)
        const body = (Result.isFailure(decoded) ? {} : decoded.success) as InjectResponseBody
        return { json: () => body, statusCode: response.status }
      }).pipe(Effect.ensuring(Effect.promise(() => webHandler.dispose())))
    }).pipe(Effect.scoped)
  }

  private get routesLayer() {
    return HttpRouter.addAll([...this.routes, notFoundRoute])
  }

  private register(method: HttpMethod, path: HttpRouter.PathInput, handler: RouteHandler): void {
    this.routes.push(HttpRouter.route(method, path, (request) => this.execute(handler, request)))
  }

  private execute(
    handler: RouteHandler,
    request: HttpServerRequest.HttpServerRequest
  ): Effect.Effect<HttpServerResponse.HttpServerResponse, never, AppRequirements> {
    return Effect.gen(function* () {
      const appRequest: AppRequest = { body: undefined }
      if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
        const body = yield* Effect.result(
          request.text.pipe(
            Effect.flatMap((raw): Effect.Effect<unknown, unknown> => {
              if (raw === '') {
                return Effect.void
              }
              const decoded = decodeJson(raw)
              return Result.isFailure(decoded) ? Effect.fail(decoded.failure) : Effect.succeed(decoded.success)
            })
          )
        )
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

      return yield* handler(appRequest, reply).pipe(
        Effect.andThen(Effect.sync(() => jsonResponse(payload, statusCode))),
        Effect.catchCause((cause) => {
          if (isInterruptedOnly(cause)) {
            return Effect.failCause(cause)
          }
          return Effect.logError(cause, 'HTTP request failed').pipe(
            Effect.andThen(DateTime.now),
            Effect.map((now) =>
              jsonResponse(
                {
                  error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
                  meta: { timestamp: DateTime.formatIso(now) },
                  success: false,
                },
                500
              )
            )
          )
        })
      )
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
      const acquireServer: Effect.Effect<HttpServer.HttpServer['Service'], never, Scope.Scope> =
        provider.server ??
        BunHttpServer.make({
          gracefulShutdownTimeout: 30_000,
          hostname: provider.options.hostname,
          port: provider.options.port,
        })
      const server = yield* acquireServer.pipe(Scope.provide(scope))
      const handler = yield* HttpRouter.toHttpEffect(provider.routesLayer).pipe(Scope.provide(scope))
      yield* server.serve(handler).pipe(Scope.provide(scope))
      yield* Effect.logInfo(`Server running at ${HttpServer.formatAddress(server.address)}/`).pipe(Effect.annotateLogs('context', ['HTTP']))
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
      yield* Effect.logInfo('Server stopped').pipe(Effect.annotateLogs('context', ['HTTP']))
    })
  }
}
