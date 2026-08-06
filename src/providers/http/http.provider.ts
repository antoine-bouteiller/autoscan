import { Effect, Result, Schema } from 'effect'

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

interface InjectOptions {
  method: string
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

const jsonResponse = (data: unknown, statusCode: number): Response => Response.json(data, { status: statusCode })

export class HttpProvider {
  private server?: ReturnType<typeof Bun.serve>
  private readonly options: Required<Omit<HttpProviderOptions, 'runPromise'>>
  private readonly routes: Record<string, Record<string, (request: Request) => Promise<Response>>> = {}
  private readonly runPromise: HttpProviderOptions['runPromise']

  constructor(options: HttpProviderOptions) {
    this.options = { hostname: options.hostname ?? '0.0.0.0', port: options.port ?? 3030 }
    this.runPromise = options.runPromise
  }

  get(path: string, handler: RouteHandler): void {
    this.register('GET', path, handler)
  }

  post<TSchema extends Schema.ConstraintDecoder<unknown>>(path: string, validator: TSchema, handler: RouteHandler<TSchema['Type']>): void {
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
    const handler = this.routes[options.url]?.[options.method]
    if (handler === undefined) {
      return { json: () => ({ error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }), statusCode: 404 }
    }
    const response = await handler(
      new Request(`http://localhost${options.url}`, {
        body: options.payload === undefined ? undefined : JSON.stringify(options.payload),
        headers: { 'content-type': 'application/json' },
        method: options.method,
      })
    )
    const body: InjectResponseBody = JSON.parse(await response.text())
    return { json: () => body, statusCode: response.status }
  }

  private register(method: string, path: string, handler: RouteHandler): void {
    this.routes[path] ??= {}
    this.routes[path][method] = (request) => this.execute(handler, request)
  }

  private async execute(handler: RouteHandler, request: Request): Promise<Response> {
    const appRequest: AppRequest = { body: undefined }
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      try {
        const raw = await request.text()
        appRequest.body = raw ? JSON.parse(raw) : undefined
      } catch {
        return jsonResponse({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' }, success: false }, 400)
      }
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

    try {
      await this.runPromise(handler(appRequest, reply))
    } catch (error) {
      logError(error)
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
  }

  start(): void {
    this.server = Bun.serve({
      fetch: () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }, 404),
      hostname: this.options.hostname,
      port: this.options.port,
      routes: this.routes,
    })
    logger.info(`Server running at http://${this.options.hostname}:${this.options.port}/`, 'HTTP')
  }

  async stop(force = false): Promise<void> {
    await this.server?.stop(force)
    logger.info('Server stopped', 'HTTP')
  }
}
