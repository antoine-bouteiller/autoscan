import { createTaggedError } from '#utils/error'

export class ValidationError extends createTaggedError({
  name: 'ValidationError',
  message: 'Validation error: $details',
}) {}
