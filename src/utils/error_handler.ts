import { ArkErrors } from 'arktype'

import { logger } from '@/config/logger'
import { BaseError, type HttpError } from '@/errors'

export const handleError = (error: unknown, ...context: string[]) => {
  if (error instanceof BaseError) {
    logger.error(error.format(), ...context)
  } else if (error instanceof ArkErrors) {
    logger.error(error.summary, ...context)
  } else if (error instanceof Error) {
    const { cause, message } = error
    const fullMessage = cause && typeof cause === 'object' && 'message' in cause ? `${message}: ${String(cause.message)}` : message
    logger.error(fullMessage, ...context)
  } else {
    logger.error(JSON.stringify(error), ...context)
  }
}

export const handleHttpError = (error: HttpError, context: string) => {
  const message = error.format()
  logger.error(`(${context}) ${message}`)
}

export const tryCatch = async <T, Args extends unknown[]>(asyncFunction: (...args: Args) => Promise<T> | T, ...args: Args) => {
  try {
    return await asyncFunction(...args)
  } catch (error) {
    handleError(error, asyncFunction.name)
  }
}
