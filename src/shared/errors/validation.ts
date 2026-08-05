import { Data } from 'effect'

interface ValidationErrorFields {
  readonly cause?: unknown
  readonly details: string
}

export class ValidationError extends Data.TaggedError('ValidationError')<ValidationErrorFields & { readonly message: string }> {
  constructor(fields: ValidationErrorFields) {
    super({ ...fields, message: `Validation error: ${fields.details}` })
  }
}
