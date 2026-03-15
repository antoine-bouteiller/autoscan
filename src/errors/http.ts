import { createTaggedError } from '#utils/error'

export type HttpErrorFormatter = (body: unknown) => string

export class HttpError extends createTaggedError({
  name: 'HttpError',
  message: '($serviceName)($route) API error ($status): $body',
}) {}
