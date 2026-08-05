import { Data } from 'effect'

interface NetworkErrorFields {
  readonly cause?: unknown
  readonly originalMessage: string
  readonly serviceName: string
}

export class NetworkError extends Data.TaggedError('NetworkError')<NetworkErrorFields & { readonly message: string }> {
  constructor(fields: NetworkErrorFields) {
    super({ ...fields, message: `(${fields.serviceName}) Network Error: ${fields.originalMessage}` })
  }
}
