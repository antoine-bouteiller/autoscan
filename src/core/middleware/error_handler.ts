import { AppError } from '@/errors/base'
import { logError } from '@/utils/error_handler'

import type { Middleware } from './types'

export const errorHandlerMiddleware: Middleware = async (_ctx, next) => {
  try {
    return await next()
  } catch (error) {
    logError(error)

    if (error instanceof AppError) {
      return error.toResponse()
    }

    return Response.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
        meta: { timestamp: new Date().toISOString() },
        success: false,
      },
      { status: 500 }
    )
  }
}
