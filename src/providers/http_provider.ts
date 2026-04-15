import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'

import { z } from 'zod'

import { logger } from '#config/logger'
import { badRequest } from '#core/response'
import { type AppReply, type AppRequest, type RouteHandler } from '#types/http'
import { logError } from '#utils/error'

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
  json(): InjectResponseBody
  statusCode: number
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })

const createReply = (res: ServerResponse): AppReply => {
  let statusCode = 200

  return {
    send(data: unknown) {
      const body = JSON.stringify(data)
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(body)
    },
    status(code: number) {
      statusCode = code
      return this
    },
  }
}

export class HttpProvider {
  private server?: Server
  private readonly options: Required<HttpProviderOptions>
  private readonly routes = new Map<string, RouteHandler>()

  constructor(options: HttpProviderOptions) {
    this.options = {
      hostname: options.hostname ?? '0.0.0.0',
      port: options.port ?? 3030,
    }
  }

  get(path: string, handler: RouteHandler): void {
    this.routes.set(`GET:${path}`, handler)
  }

  post<TSchema extends z.ZodType>(path: string, validator: TSchema, handler: RouteHandler<z.output<TSchema>>): void {
    this.routes.set(`POST:${path}`, async (request: AppRequest, reply: AppReply) => {
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
    const handler = this.routes.get(`${options.method}:${options.url}`)

    const result: { body: InjectResponseBody; statusCode: number } = {
      body: { success: false },
      statusCode: 200,
    }

    const reply: AppReply = {
      send(data: unknown) {
        Object.assign(result, { body: data })
      },
      status(code: number) {
        result.statusCode = code
        return this
      },
    }

    const request: AppRequest = { body: options.payload }

    if (handler) {
      try {
        await handler(request, reply)
      } catch (error) {
        logError(error)
        result.statusCode = 500
        result.body = {
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
          meta: { timestamp: new Date().toISOString() },
          success: false,
        }
      }
    } else {
      result.statusCode = 404
      result.body = { error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }
    }

    return {
      json: () => result.body,
      statusCode: result.statusCode,
    }
  }

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      const url = req.url ?? '/'
      const method = req.method ?? 'GET'
      const handler = this.routes.get(`${method}:${url}`)

      if (!handler) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found' }, success: false }))
        return
      }

      const request: AppRequest = { body: undefined }

      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        try {
          const raw = await readBody(req)
          request.body = raw ? JSON.parse(raw) : undefined
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' }, success: false }))
          return
        }
      }

      const reply = createReply(res)

      try {
        await handler(request, reply)
      } catch (error) {
        logError(error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
              meta: { timestamp: new Date().toISOString() },
              success: false,
            })
          )
        }
      }
    })

    await new Promise<void>((resolve) => {
      this.server?.listen(this.options.port, this.options.hostname, () => resolve())
    })

    logger.info(`Server running at http://${this.options.hostname}:${this.options.port}/`, 'HTTP')
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close((error) => (error ? reject(error) : resolve()))
    })
    logger.info('Server stopped', 'HTTP')
  }
}
