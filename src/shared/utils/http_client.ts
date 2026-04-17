import { z } from 'zod'

import { HttpError } from '#shared/errors/http'
import { NetworkError } from '#shared/errors/network'
import { ValidationError } from '#shared/errors/validation'
import {
  type AnySchema,
  type GetOptionWithoutResponse,
  type GetOptions,
  type HttpClient,
  type HttpClientOptions,
  type HttpClientResult,
  type HttpClientVoidResult,
  type RequestOptions,
  type RequestParams,
  type RequestWithoutResponseOption,
} from '#shared/types/http_client'

const defaultFormatter = (body: unknown): string => (typeof body === 'string' ? body : JSON.stringify(body))

const createUrl = (baseUrl: string, endpoint: string, params?: RequestParams): URL => {
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

export const httpClient = ({ baseUrl = '', errorFormatter, headers: globalHeaders = {}, serviceName }: HttpClientOptions): HttpClient => {
  function request(method: string, endpoint: string, options?: RequestWithoutResponseOption): Promise<HttpClientVoidResult>
  function request<TSchema extends AnySchema>(method: string, endpoint: string, options?: RequestOptions<TSchema>): Promise<HttpClientResult<TSchema>>

  async function request<TSchema extends AnySchema | undefined = undefined>(method: string, endpoint: string, options: RequestOptions<TSchema> = {}) {
    const { body, headers = {}, params, validator } = options

    const url = createUrl(baseUrl, endpoint, params)

    let response: Response
    try {
      response = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers: { ...globalHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        method,
      })
    } catch (error) {
      return new NetworkError({ originalMessage: error instanceof Error ? error.message : 'Unknown network error', serviceName })
    }

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => response.statusText)

      return new HttpError({ body: (errorFormatter ?? defaultFormatter)(errorData), route: endpoint, serviceName, status: response.status })
    }

    if (!validator) {
      await response.body?.cancel()
      return undefined
    }

    const json = await response.json().catch(() => undefined)

    const result = validator.safeParse(json)
    if (!result.success) {
      return new ValidationError({ details: JSON.stringify(z.treeifyError(result.error)) })
    }

    return result.data
  }

  return {
    delete: (url: string, opts?: GetOptionWithoutResponse): Promise<HttpClientVoidResult> => request('DELETE', url, opts),
    get: (url: string, opts?: GetOptions<AnySchema> | GetOptionWithoutResponse) => request('GET', url, opts),
    patch: (url: string, opts?: RequestWithoutResponseOption): Promise<HttpClientVoidResult> => request('PATCH', url, opts),
    post: (url: string, opts?: GetOptions<AnySchema> | GetOptionWithoutResponse) => request('POST', url, opts),
    put: (url: string, opts?: RequestWithoutResponseOption): Promise<HttpClientVoidResult> => request('PUT', url, opts),
  }
}
