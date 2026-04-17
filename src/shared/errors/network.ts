import { createTaggedError } from '#shared/utils/error'

export class NetworkError extends createTaggedError({
  message: '($serviceName) Network Error: $originalMessage',
  name: 'NetworkError',
}) {}
