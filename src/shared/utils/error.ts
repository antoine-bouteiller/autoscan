import { logger } from '@/config/logger'

export const logError = (error: unknown, ...context: string[]): void => {
  if (error instanceof Error) {
    const { cause, message } = error
    const fullMessage = cause && typeof cause === 'object' && 'message' in cause ? `${message}: ${String(cause.message)}` : message
    logger.error(fullMessage, ...context)
  } else {
    logger.error(JSON.stringify(error), ...context)
  }
}
