import { ZodError } from 'zod'

import { logger } from '@/config/logger'
import { CloudflareError } from 'cloudflare'

export const handleError = (error: unknown, context: object = {}) => {
  if (error instanceof ZodError) {
    logger.error({ ...context, issues: error.issues }, 'Parsing error')
  } else if (error instanceof CloudflareError && 'errors' in error && Array.isArray(error.errors)) {
    logger.error(context, error.errors.map((error) => error.message).join(', '))
  } else if (error instanceof Error) {
    const { message, cause } = error
    const fullMessage =
      cause && typeof cause === 'object' && 'message' in cause
        ? `${message}: ${cause.message}`
        : message
    logger.error(context, fullMessage)
  } else {
    logger.error(context, JSON.stringify(error))
  }
}

export const tryCatch = async <T, Args extends unknown[]>(
  asyncFunction: (...args: Args) => Promise<T> | T,
  ...args: Args
) => {
  try {
    return await asyncFunction(...args)
  } catch (error) {
    handleError(error, { args, function: asyncFunction.name })
  }
}
