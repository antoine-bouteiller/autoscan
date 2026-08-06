import { type Effect, type Schema } from 'effect'

import { type HttpError, type HttpErrorFormatter, type RequestTimeoutError } from '@/shared/errors/http'
import { type NetworkError } from '@/shared/errors/network'
import { type ValidationError } from '@/shared/errors/validation'

export type AnySchema = Schema.ConstraintDecoder<unknown>
export type RequestParams = Record<string, boolean | number | string>

export interface RequestOptions<TSchema extends AnySchema | undefined = undefined> {
  body?: unknown
  headers?: Record<string, string>
  params?: RequestParams
  retry?: boolean
  timeout?: number
  validator?: TSchema
}

export type RequestWithoutResponseOption = Omit<RequestOptions, 'validator'>

export interface HttpClientOptions {
  baseUrl?: string
  errorFormatter?: HttpErrorFormatter
  headers?: Record<string, string>
  serviceName: string
}

export type HttpClientError = HttpError | NetworkError | RequestTimeoutError | ValidationError
export type HttpClientVoidResult = Effect.Effect<void, HttpClientError>
export type HttpClientResult<TSchema extends AnySchema> = Effect.Effect<TSchema['Type'], HttpClientError>
export type GetOptions<TSchema extends AnySchema> = Omit<RequestOptions<TSchema>, 'body'>
export type GetOptionWithoutResponse = Omit<RequestWithoutResponseOption, 'body'>

export interface HttpClient {
  delete: (url: string, options?: GetOptionWithoutResponse) => HttpClientVoidResult
  get: {
    (url: string, options?: GetOptionWithoutResponse): HttpClientVoidResult
    <TSchema extends AnySchema>(url: string, options: GetOptions<TSchema>): HttpClientResult<TSchema>
  }
  patch: (url: string, options?: RequestWithoutResponseOption) => HttpClientVoidResult
  post: {
    (url: string, options?: RequestWithoutResponseOption): HttpClientVoidResult
    <TSchema extends AnySchema>(url: string, options: RequestOptions<TSchema>): HttpClientResult<TSchema>
  }
  put: (url: string, options?: RequestWithoutResponseOption) => HttpClientVoidResult
}
