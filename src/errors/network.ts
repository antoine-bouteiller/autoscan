import { createTaggedError } from '../utils/error'

export class NetworkError extends createTaggedError({
  name: 'NetworkError',
  message: '($serviceName) Network Error: $originalMessage',
}) {}
