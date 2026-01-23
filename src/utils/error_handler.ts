import { logger } from '@/config/logger'

export const logError = (error: unknown, ...context: string[]) => {
  if (error instanceof Error) {
    const { cause, message } = error
    const fullMessage = cause && typeof cause === 'object' && 'message' in cause ? `${message}: ${String(cause.message)}` : message
    logger.error(fullMessage, ...context)
  } else {
    logger.error(JSON.stringify(error), ...context)
  }
}

export const tryCatch = async <T, Args extends unknown[]>(asyncFunction: (...args: Args) => Promise<T> | T, ...args: Args) => {
  try {
    return await asyncFunction(...args)
  } catch (error) {
    logError(error, asyncFunction.name)
  }
}
