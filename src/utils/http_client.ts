import { ArkErrors, type Type } from 'arktype'

interface HttpClientOptions<E = unknown> {
  baseUrl?: `https://${string}/` | URL
  errorValidator?: Type<E>
  headers?: Record<string, string>
}

interface RequestOptions<T = void> {
  body?: unknown
  headers?: Record<string, string>
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  params?: Record<string, boolean | number | string>
  validator?: Type<T>
}

export type HttpError<E = unknown> =
  | { body: E; status: number; type: 'api' }
  | { errors: ArkErrors; type: 'validation' }
  | { message: string; type: 'network' }
  | { message: string; type: 'parse' }
  | { status: number; statusText: string; type: 'http' }

type RequestResponse<T, E = unknown> = { data: T; ok: true } | { error: HttpError<E>; ok: false }

export const httpClient = <E = unknown>(options: HttpClientOptions<E> = {}) => {
  const { baseUrl = '', errorValidator, headers: defaultHeaders = {} } = options

  const buildUrl = (endpoint: string, params?: Record<string, boolean | number | string>) => {
    const url = new URL(endpoint, baseUrl || undefined)

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

    // Catch network errors
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

    // Handle non-OK responses
    if (!response.ok) {
      if (errorValidator) {
        try {
          const errorBody = await response.json()
          const result = errorValidator(errorBody)
          if (result instanceof ArkErrors) {
            return { error: { errors: result, type: 'validation' }, ok: false }
          }
          return {
            error: { body: result as E, status: response.status, type: 'api' },
            ok: false,
          }
        } catch {
          // JSON parsing failed, fall through to generic HTTP error
        }
      }
      return {
        error: {
          status: response.status,
          statusText: response.statusText,
          type: 'http',
        },
        ok: false,
      }
    }

    // Handle successful responses
    if (validator) {
      let data: unknown
      try {
        data = await response.json()
      } catch {
        return {
          error: { message: 'Failed to parse response as JSON', type: 'parse' },
          ok: false,
        }
      }

      const result = validator(data)
      if (result instanceof ArkErrors) {
        return { error: { errors: result, type: 'validation' }, ok: false }
      }
      return { data: result as T, ok: true }
    }

    return { data: undefined as T, ok: true }
  }

  return {
    delete: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'DELETE' }),

    get: async <T = unknown>(
      endpoint: string,
      options: Omit<RequestOptions<T>, 'body' | 'method'> = {}
    ) => request<T>(endpoint, { ...options, method: 'GET' }),

    patch: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'PATCH' }),

    post: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'POST' }),

    put: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'PUT' }),
  }
}

export type HttpClient = ReturnType<typeof httpClient>
