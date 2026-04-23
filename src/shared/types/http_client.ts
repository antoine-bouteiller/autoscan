import { type z } from 'zod'

import { type HttpError, type HttpErrorFormatter } from '#/shared/errors/http'
import { type NetworkError } from '#/shared/errors/network'
import { type ValidationError } from '#/shared/errors/validation'

export type AnySchema = z.ZodType

export type RequestParams = Record<string, string | number | boolean>

export interface RequestOptions<TSchema extends AnySchema | undefined = undefined> {
  body?: unknown
  headers?: Record<string, string>
  params?: RequestParams
  validator?: TSchema
}

export type RequestWithoutResponseOption = Omit<RequestOptions, 'validator'>

export interface HttpClientOptions {
  baseUrl?: string
  errorFormatter?: HttpErrorFormatter
  headers?: Record<string, string>
  serviceName: string
}

export type HttpClientError = HttpError | NetworkError | ValidationError

export type HttpClientVoidResult = HttpClientError | undefined

export type HttpClientResult<TSchema extends AnySchema> = HttpClientError | z.infer<TSchema>

export type GetOptions<TSchema extends AnySchema> = Omit<RequestOptions<TSchema>, 'body'>

export type GetOptionWithoutResponse = Omit<RequestWithoutResponseOption, 'body'>

export interface HttpClient {
  delete: (url: string, opts?: GetOptionWithoutResponse) => Promise<HttpClientVoidResult>
  get: {
    (url: string, opts?: GetOptionWithoutResponse): Promise<HttpClientVoidResult>
    <TSchema extends AnySchema>(url: string, opts: GetOptions<TSchema>): Promise<HttpClientResult<TSchema>>
  }
  patch: (url: string, opts?: RequestWithoutResponseOption) => Promise<HttpClientVoidResult>
  post: {
    (url: string, opts?: RequestWithoutResponseOption): Promise<HttpClientVoidResult>
    <TSchema extends AnySchema>(url: string, opts: RequestOptions<TSchema>): Promise<HttpClientResult<TSchema>>
  }
  put: (url: string, opts?: RequestWithoutResponseOption) => Promise<HttpClientVoidResult>
}
