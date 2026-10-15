import { Schema } from 'effect'

export class ValidationError extends Schema.TaggedError<ValidationError, { readonly brand: unique symbol }>()('ValidationError', {
  cause: Schema.optional(Schema.Unknown),
  details: Schema.String,
}) {
  override get message() {
    return `Validation error: ${this.details}`
  }
}
