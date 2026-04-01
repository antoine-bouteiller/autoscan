import { createTaggedError } from '#utils/error'

export type HttpErrorFormatter = (body: unknown) => string

export class HttpError extends createTaggedError({
  message: '($serviceName)($route) API error ($status): $body',
  name: 'HttpError',
}) {}
