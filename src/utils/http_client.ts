import { type Type } from 'arktype'

interface HttpClientOptions {
  baseUrl?: string
  headers?: Record<string, string>
}

interface RequestOptions<T = unknown> {
  body?: T
  headers?: Record<string, string>
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  params?: Record<string, boolean | number | string>
}

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const httpClient = (options: HttpClientOptions = {}) => {
  const { baseUrl = '', headers: defaultHeaders = {} } = options

  const buildUrl = (endpoint: string, params?: Record<string, boolean | number | string>) => {
    const url = new URL(endpoint, baseUrl || undefined)

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value))
      }
    }

    return url
  }

  const request = async (endpoint: string, options: RequestOptions = {}): Promise<Response> => {
    const { body, headers = {}, method = 'GET', params } = options

    const url = buildUrl(endpoint, params)

    const requestHeaders: Record<string, string> = {
      ...defaultHeaders,
      ...headers,
    }

    if (body) {
      requestHeaders['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: requestHeaders,
      method,
    })

    return response
  }

  return {
    delete: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'DELETE' }),

    get: async <T = unknown>(
      endpoint: string,
      {
        validator,
        ...options
      }: Omit<RequestOptions, 'body' | 'method'> & {
        validator?: Type<T>
      } = {}
    ): Promise<T> => {
      const response = await request(endpoint, { ...options, method: 'GET' })

      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText
        )
      }

      const data = await response.json()

      if (!validator) {
        return data as T
      }

      return validator.assert(data) as T
    },

    patch: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'PATCH' }),

    post: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'POST' }),

    put: async (endpoint: string, options: Omit<RequestOptions, 'method'> = {}) =>
      request(endpoint, { ...options, method: 'PUT' }),
  }
}

export type HttpClient = ReturnType<typeof httpClient>
