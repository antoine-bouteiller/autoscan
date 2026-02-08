interface ApiResponse<T> {
  data?: T
  error?: { code: string; details?: unknown; message: string }
  meta?: { timestamp: string }
  success: boolean
}

const createResponse = <T>(body: ApiResponse<T>, status: number): Response =>
  Response.json(
    {
      ...body,
      meta: { timestamp: new Date().toISOString() },
    },
    { status }
  )

export const success = <T>(data: T, status = 200): Response => createResponse({ data, success: true }, status)

export const created = <T>(data: T): Response => success(data, 201)

export const error = (code: string, message: string, status = 500, details?: unknown): Response =>
  createResponse(
    {
      error: { code, details, message },
      success: false,
    },
    status
  )

export const badRequest = (message: string, details?: unknown): Response => error('BAD_REQUEST', message, 400, details)

export const notFound = (message = 'Resource not found'): Response => error('NOT_FOUND', message, 404)
