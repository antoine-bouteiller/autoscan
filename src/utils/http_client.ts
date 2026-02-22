import * as v from 'valibot'

import { HttpError, type HttpErrorFormatter } from '@/errors/http'
import { NetworkError } from '@/errors/network'
import { ValidationError } from '@/errors/validation'

const defaultFormatter: HttpErrorFormatter = (body) => (typeof body === 'string' ? body : JSON.stringify(body))

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

type RequestParams = Record<string, string | number | boolean>

interface RequestOptions<TSchema extends AnySchema | undefined = undefined> {
  body?: unknown
  headers?: Record<string, string>
  params?: RequestParams
  validator?: TSchema
}

type RequestOptionWithoutResponse = Omit<RequestOptions, 'validator'>

interface Options {
  baseUrl?: string
  errorFormatter?: HttpErrorFormatter
  headers?: Record<string, string>
  serviceName: string
}

export const httpClient = ({ baseUrl = '', errorFormatter, headers: globalHeaders = {}, serviceName }: Options) => {
  const createUrl = (endpoint: string, params?: RequestParams) => {
    const cleanBase = baseUrl.replace(/\/+$/, '')
    const cleanEndpoint = endpoint.replace(/^\/+/, '')
    const fullPath = cleanBase ? `${cleanBase}/${cleanEndpoint}` : cleanEndpoint

    const url = new URL(fullPath)

    if (params) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        searchParams.append(key, String(value))
      }
      url.search = searchParams.toString()
    }

    return url
  }

  function request(
    method: string,
    endpoint: string,
    options?: RequestOptionWithoutResponse
  ): Promise<HttpError | NetworkError | ValidationError | undefined>

  function request<TSchema extends AnySchema>(
    method: string,
    endpoint: string,
    options?: Omit<RequestOptions<TSchema>, 'body'>
  ): Promise<HttpError | NetworkError | ValidationError | v.InferOutput<TSchema>>

  async function request<TSchema extends AnySchema | undefined = undefined>(method: string, endpoint: string, options: RequestOptions<TSchema> = {}) {
    const { body, headers = {}, params, validator } = options

    const url = createUrl(endpoint, params)

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: { ...globalHeaders, ...headers },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      return new NetworkError({ serviceName, originalMessage: error instanceof Error ? error.message : 'Unknown network error' })
    }

    if (!response.ok) {
      let errorData: unknown = response.statusText
      try {
        errorData = await response.json()
      } catch {
        // Keep statusText as errorData
      }

      return new HttpError({ serviceName, status: response.status, body: (errorFormatter ?? defaultFormatter)(errorData) })
    }

    if (!validator) {
      return undefined
    }

    const json = await response.json().catch(() => undefined)

    const result = v.safeParse(validator, json)
    if (!result.success) {
      return new ValidationError({ details: JSON.stringify(v.flatten(result.issues)) })
    }

    return result.output
  }

  return {
    delete: (url: string, opts?: Omit<RequestOptionWithoutResponse, 'body'>) => request('DELETE', url, opts),
    get: <TSchema extends AnySchema>(url: string, opts?: Omit<RequestOptions<TSchema>, 'body'>) => request('GET', url, opts),
    patch: (url: string, opts?: RequestOptionWithoutResponse) => request('PATCH', url, opts),
    post: (url: string, opts?: RequestOptionWithoutResponse) => request('POST', url, opts),
    put: (url: string, opts?: RequestOptionWithoutResponse) => request('PUT', url, opts),
  }
}
