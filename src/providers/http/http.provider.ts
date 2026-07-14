import { z } from 'zod'

import { logger } from '@/config/logger'
import { badRequest } from '@/providers/http/response'
import { type AppReply, type AppRequest, type RouteHandler } from '@/providers/http/types'
import { logError } from '@/shared/utils/error'

interface HttpProviderOptions {
  hostname?: string
  port?: number
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
  private readonly options: Required<HttpProviderOptions>
  private readonly routes: Record<string, Record<string, (req: Request) => Promise<Response>>> = {}

  constructor(options: HttpProviderOptions) {
    this.options = {
      hostname: options.hostname ?? '0.0.0.0',
      port: options.port ?? 3030,
    }
  }

  get(path: string, handler: RouteHandler): void {
    this.register('GET', path, handler)
  }

  post<TSchema extends z.ZodType>(path: string, validator: TSchema, handler: RouteHandler<z.output<TSchema>>): void {
    this.register('POST', path, async (request: AppRequest, reply: AppReply) => {
      const result = validator.safeParse(request.body)

      if (!result.success) {
        logError(result.error.issues, path)
        badRequest(reply, 'invalid request', z.treeifyError(result.error))
        return
      }

      await handler({ body: result.data }, reply)
    })
  }

  async inject(options: InjectOptions): Promise<InjectResponse> {
    const handler = this.routes[options.url]?.[options.method]

    if (!handler) {
      return {
        json: () => ({ error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }),
        statusCode: 404,
      }
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
    this.routes[path][method] = (req) => this.execute(handler, req)
  }

  private async execute(handler: RouteHandler, req: Request): Promise<Response> {
    const { method } = req
    const request: AppRequest = { body: undefined }

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        const raw = await req.text()
        request.body = raw ? JSON.parse(raw) : undefined
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
      await handler(request, reply)
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

  async start(): Promise<void> {
    this.server = Bun.serve({
      fetch: () => jsonResponse({ error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }, 404),
      hostname: this.options.hostname,
      port: this.options.port,
      routes: this.routes,
    })

    logger.info(`Server running at http://${this.options.hostname}:${this.options.port}/`, 'HTTP')

    await Promise.resolve()
  }

  async stop(): Promise<void> {
    await this.server?.stop()
    logger.info('Server stopped', 'HTTP')
  }
}
