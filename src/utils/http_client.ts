import { ArkErrors, type, type Type } from 'arktype'
import { logger } from '@/config/logger'

export type HttpError<E = unknown> =
  | { body: E; status: number; type: 'api' }
  | { errors: ArkErrors; type: 'validation' }
  | { message: string; type: 'network' }
  | { message: string; type: 'parse' }
  | { status: number; statusText: string; type: 'http' }

export type RequestResponse<T, E = unknown> =
  | { data: Type<T>['infer']; ok: true }
  | { error: HttpError<Type<E>['infer']>; ok: false }

interface RequestOptions<T = undefined> {
  body?: unknown
  headers?: Record<string, string>
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  params?: Record<string, boolean | number | string>
  validator?: Type<T>
}

interface Options<E = unknown> {
  baseUrl?: string
  headers?: Record<string, string>
  errorValidator?: Type<E>
}

export interface HttpClient<E> {
  get: <T = unknown>(
    endpoint: string,
    options?: Omit<RequestOptions<T>, 'body' | 'method'>
  ) => Promise<RequestResponse<T, E>>

  post: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined, E>>

  put: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined, E>>

  patch: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined, E>>

  delete: (
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ) => Promise<RequestResponse<undefined, E>>
}

export const httpClient = <E = unknown>(options: Options<E> = {}): HttpClient<E> => {
  const { baseUrl = '', headers: defaultHeaders = {} } = options

  const errorValidator =
    'errorValidator' in options && options.errorValidator
      ? options.errorValidator
      : (type('object') as unknown as Type<E>)

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
  ): Promise<RequestResponse<T, E>> => {
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
        error: {
          message: error instanceof Error ? error.message : 'Unknown network error',
          type: 'network',
        },
        ok: false,
      }
    }

    if (!response.ok) {
      try {
        const errorBody = await response.json()
        const result = errorValidator(errorBody)

        if (result instanceof ArkErrors) {
          return { error: { errors: result, type: 'validation' }, ok: false }
        }
        return {
          error: { body: result, status: response.status, type: 'api' },
          ok: false,
        }
      } catch {
        // Fallthrough
      }
      logger.error(url.toString())
      logger.error(JSON.stringify(response))
      return {
        error: {
          status: response.status,
          statusText: response.statusText,
          type: 'http',
        },
        ok: false,
      }
    }

    if (validator) {
      let data: unknown
      try {
        data = await response.json()
      } catch {
        return {
          error: { message: 'Failed to parse JSON', type: 'parse' },
          ok: false,
        }
      }
      const result = validator(data)
      if (result instanceof ArkErrors) {
        return { error: { errors: result, type: 'validation' }, ok: false }
      }
      return { data: result, ok: true }
    }

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
