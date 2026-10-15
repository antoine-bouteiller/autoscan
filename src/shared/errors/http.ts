import { Schema } from 'effect'

export type HttpErrorFormatter = (body: unknown) => string

export class HttpError extends Schema.TaggedError<HttpError, { readonly brand: unique symbol }>()('HttpError', {
  body: Schema.String,
  cause: Schema.optional(Schema.Unknown),
  retryAfterMs: Schema.optional(Schema.Finite),
  route: Schema.String,
  serviceName: Schema.String,
  status: Schema.Finite,
}) {
  override get message() {
    return `(${this.serviceName})(${this.route}) API error (${this.status}): ${this.body}`
  }
}

export class RequestTimeoutError extends Schema.TaggedError<RequestTimeoutError, { readonly brand: unique symbol }>()('RequestTimeoutError', {
  cause: Schema.optional(Schema.Unknown),
  route: Schema.String,
  serviceName: Schema.String,
}) {
  override get message() {
    return `(${this.serviceName})(${this.route}) Request timed out`
  }
}
