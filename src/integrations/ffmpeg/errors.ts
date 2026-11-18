import { Schema } from 'effect'

export class SpeechActivityError extends Schema.TaggedError<SpeechActivityError, { readonly brand: unique symbol }>()('SpeechActivityError', {
  cause: Schema.optional(Schema.Unknown),
  details: Schema.String,
}) {
  override get message() {
    return `Speech activity detection failed: ${this.details}`
  }
}
