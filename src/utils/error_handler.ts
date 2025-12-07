import { ArkErrors } from 'arktype'

import { logger } from '@/config/logger'

export const handleError = (error: unknown, ...context: string[]) => {
  if (error instanceof ArkErrors) {
    logger.error(error.summary, ...context)
  } else if (error instanceof Error) {
    const { cause, message } = error
    const fullMessage =
      cause && typeof cause === 'object' && 'message' in cause
        ? `${message}: ${cause.message}`
        : message
    logger.error(fullMessage, ...context)
  } else {
    logger.error(JSON.stringify(error), ...context)
  }
}

export const tryCatch = async <T, Args extends unknown[]>(
  asyncFunction: (...args: Args) => Promise<T> | T,
  ...args: Args
) => {
  try {
    return await asyncFunction(...args)
  } catch (error) {
    handleError(error, asyncFunction.name)
  }
}
