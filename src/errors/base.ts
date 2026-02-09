export class AppError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    Error.captureStackTrace(this, this.constructor)
  }

  toResponse(): Response {
    return Response.json(
      {
        error: {
          code: this.code,
          message: this.message,
        },
        meta: { timestamp: new Date().toISOString() },
        success: false,
      },
      { status: this.statusCode }
    )
  }
}
