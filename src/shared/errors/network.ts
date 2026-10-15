import { Schema } from 'effect'

export class NetworkError extends Schema.TaggedError<NetworkError, { readonly brand: unique symbol }>()('NetworkError', {
  cause: Schema.optional(Schema.Unknown),
  originalMessage: Schema.String,
  serviceName: Schema.String,
}) {
  override get message() {
    return `(${this.serviceName}) Network Error: ${this.originalMessage}`
  }
}
