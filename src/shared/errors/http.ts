import { createTaggedError } from '#shared/utils/error'

export type HttpErrorFormatter = (body: unknown) => string

export class HttpError extends createTaggedError({
  message: '($serviceName)($route) API error ($status): $body',
  name: 'HttpError',
}) {}
