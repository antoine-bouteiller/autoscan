import { ArkErrors } from 'arktype'

import type { HttpError } from '@/utils/http_client'

import { logger } from '@/config/logger'

// Format HttpError into a readable message
export const formatHttpError = <E>(
  error: HttpError<E>,
  apiFormatter?: (body: E) => string
): string => {
  switch (error.type) {
    case 'api': {
      const body = typeof error.body === 'string' ? error.body : JSON.stringify(error.body)

      return apiFormatter ? apiFormatter(error.body) : `API error (${error.status}): ${body}`
    }
    case 'http': {
      return `HTTP ${error.status}: ${error.statusText}`
    }
    case 'network': {
      return `Network error: ${error.message}`
    }
    case 'parse': {
      return `Parse error: ${error.message}`
    }
    case 'validation': {
      return `Validation error: ${error.errors.summary}`
    }
  }
}

export const handleError = (error: unknown, ...context: string[]) => {
  if (error instanceof ArkErrors) {
    logger.error(error.summary, ...context)
  } else if (error instanceof Error) {
    const { cause, message } = error
    const fullMessage =
      cause && typeof cause === 'object' && 'message' in cause
        ? `${message}: ${String(cause.message)}`
        : message
    logger.error(fullMessage, ...context)
  } else {
    logger.error(JSON.stringify(error), ...context)
  }
}

export const handleHttpError = <E>(
  error: HttpError<E>,
  context: string,
  apiFormatter?: (body: E) => string
) => {
  const message = formatHttpError(error, apiFormatter)
  logger.error(`(${context}) ${message}`)
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
