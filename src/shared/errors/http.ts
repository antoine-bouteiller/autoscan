import { Data } from 'effect'

export type HttpErrorFormatter = (body: unknown) => string

interface HttpErrorFields {
  readonly body: string
  readonly cause?: unknown
  readonly retryAfterMs?: number
  readonly route: string
  readonly serviceName: string
  readonly status: number
}

export class HttpError extends Data.TaggedError('HttpError')<HttpErrorFields & { readonly message: string }> {
  constructor(fields: HttpErrorFields) {
    super({ ...fields, message: `(${fields.serviceName})(${fields.route}) API error (${fields.status}): ${fields.body}` })
  }
}

interface RequestTimeoutErrorFields {
  readonly cause?: unknown
  readonly route: string
  readonly serviceName: string
}

export class RequestTimeoutError extends Data.TaggedError('RequestTimeoutError')<RequestTimeoutErrorFields & { readonly message: string }> {
  constructor(fields: RequestTimeoutErrorFields) {
    super({ ...fields, message: `(${fields.serviceName})(${fields.route}) Request timed out` })
  }
}
