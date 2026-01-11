import { ArkErrors, type, type Type } from 'arktype'

import { logger } from '@/config/logger'
import {
  ApiError,
  type HttpError,
  HttpStatusError,
  NetworkError,
  ParseError,
  ValidationError,
} from '@/errors'

export type RequestResponse<T> =
  | { data: Type<T>['infer']; ok: true }
  | { error: HttpError; ok: false }

interface RequestOptions<T = undefined> {
  body?: unknown
  headers?: Record<string, string>
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  params?: Record<string, boolean | number | string>
  validator?: Type<T>
}

interface Options<E = unknown> {
  baseUrl?: string
  errorValidator?: Type<E>
  headers?: Record<string, string>
}

export interface HttpClient {
  delete: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined>>

  get: <T = unknown>(
    endpoint: string,
    options?: Omit<RequestOptions<T>, 'body' | 'method'>
  ) => Promise<RequestResponse<T>>

  patch: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined>>

  post: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined>>

  put: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined>>
}

export const httpClient = <E = unknown>(options: Options<E> = {}): HttpClient => {
  const { baseUrl = '', headers: defaultHeaders = {} } = options

  const errorValidator =
    'errorValidator' in options && options.errorValidator
      ? options.errorValidator
      : // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
        (type('object') as unknown as Type<E>)

  const buildUrl = (endpoint: string, params?: Record<string, boolean | number | string>) => {
    const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : ''
    const cleanEndpoint = endpoint.replace(/^\/+/, '')

    const urlString = cleanBase ? `${cleanBase}/${cleanEndpoint}` : cleanEndpoint

    const url = new URL(urlString)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value))
      }
    }
    return url
  }

  const request = async <T = undefined>(
    endpoint: string,
    options: RequestOptions<T> = {}
  ): Promise<RequestResponse<T>> => {
    const { body, headers = {}, method = 'GET', params, validator } = options
    const url = buildUrl(endpoint, params)

    const requestHeaders: Record<string, string> = {
      ...defaultHeaders,
      ...headers,
    }

    if (body) {
      requestHeaders['Content-Type'] = 'application/json'
    }

    let response: Response
    try {
      response = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers: requestHeaders,
        method,
      })
    } catch (error) {
      return {
        error: new NetworkError(error instanceof Error ? error.message : 'Unknown network error'),
        ok: false,
      }
    }

    if (!response.ok) {
      try {
        const errorBody = await response.json()
        const result = errorValidator(errorBody)

        if (result instanceof ArkErrors) {
          return { error: new ValidationError(result), ok: false }
        }
        return {
          error: new ApiError(response.status, result),
          ok: false,
        }
      } catch {
        // Fallthrough
      }
      logger.error(url.toString())
      logger.error(JSON.stringify(response))
      return {
        error: new HttpStatusError(response.status, response.statusText),
        ok: false,
      }
    }

    if (validator) {
      let data: unknown
      try {
        data = await response.json()
      } catch {
        return {
          error: new ParseError('Failed to parse JSON'),
          ok: false,
        }
      }
      const result = validator(data)
      if (result instanceof ArkErrors) {
        return { error: new ValidationError(result), ok: false }
      }
      return { data: result, ok: true }
    }

    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    return { data: undefined as Type<T>['infer'], ok: true }
  }

  return {
    delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
    get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
    patch: (endpoint, options) => request(endpoint, { ...options, method: 'PATCH' }),
    post: (endpoint, options) => request(endpoint, { ...options, method: 'POST' }),
    put: (endpoint, options) => request(endpoint, { ...options, method: 'PUT' }),
  }
}
