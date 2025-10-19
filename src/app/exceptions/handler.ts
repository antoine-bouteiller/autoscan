import { ZodError } from 'zod'

import { logger } from '@/config/logger'

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    logger.error(error.message)
  } else if (error instanceof Error) {
    let message = error.message
    if (error.cause && 'object' === typeof error.cause && 'message' in error.cause) {
      message += `: ${error.cause.message}`
    }
    logger.error(message)
  } else {
    logger.error(String(error))
  }
}

export async function tryCatch<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  ...args: Args
) {
  try {
    return await fn(...args)
  } catch (error) {
    handleError(error)
  }
}
