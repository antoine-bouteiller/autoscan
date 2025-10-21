import { ZodError } from 'zod'

import { logger } from '@/config/logger'

export const handleError = (error: unknown) => {
  if (error instanceof ZodError) {
    logger.error(error.message)
  } else if (error instanceof Error) {
    const { message, cause } = error
    const fullMessage =
      cause && typeof cause === 'object' && 'message' in cause
        ? `${message}: ${cause.message}`
        : message
    logger.error(fullMessage)
  } else {
    logger.error(String(error))
  }
}

export const tryCatch = async <T, Args extends unknown[]>(
  asyncFunction: (...args: Args) => Promise<T>,
  ...args: Args
) => {
  try {
    return await asyncFunction(...args)
  } catch (error) {
    handleError(error)
  }
}
