import { createTaggedError } from '#utils/error'

export class ValidationError extends createTaggedError({
  message: 'Validation error: $details',
  name: 'ValidationError',
}) {}
