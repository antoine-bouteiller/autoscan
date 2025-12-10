import { ArkErrors, type, type Type } from 'arktype'

// --- 1. Fixed Types (Replaced void with undefined) ---

export type HttpError<E = unknown> =
  | { body: E; status: number; type: 'api' }
  | { errors: ArkErrors; type: 'validation' }
  | { message: string; type: 'network' }
  | { message: string; type: 'parse' }
  | { status: number; statusText: string; type: 'http' }

export type RequestResponse<T, E = unknown> =
  | { data: Type<T>['infer']; ok: true }
  | { error: HttpError<Type<E>['infer']>; ok: false }

// FIX 1: Default T to 'undefined', not 'void'
interface RequestOptions<T = undefined> {
  body?: unknown
  headers?: Record<string, string>
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
  params?: Record<string, boolean | number | string>
  validator?: Type<T>
}

interface BaseOptions {
  baseUrl?: `https://${string}/` | URL
  headers?: Record<string, string>
}

interface OptionsWithValidator<E> extends BaseOptions {
  errorValidator: Type<E>
}

interface OptionsDefault extends BaseOptions {
  errorValidator?: never
}

// --- 2. Explicit Client Interface ---

export interface HttpClient<E> {
  get: <T = unknown>(
    endpoint: string,
    options?: Omit<RequestOptions<T>, 'body' | 'method'>
  ) => Promise<RequestResponse<T, E>>

  // FIX 2: Explicitly return RequestResponse<undefined, E> for non-body methods
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

// --- 3. Implementation ---

export function httpClient(options?: OptionsDefault): HttpClient<unknown>
export function httpClient<E>(options: OptionsWithValidator<E>): HttpClient<E>

export function httpClient<E = unknown>(
  options: OptionsDefault | OptionsWithValidator<E> = {}
): HttpClient<E> {
  const { baseUrl = '', headers: defaultHeaders = {} } = options

  // FIX 3: Use 'any' to appease the strict linter (oxc/eslint)
  // We know this is safe because of the Overloads above.
  const errorValidator =
    'errorValidator' in options && options.errorValidator
      ? options.errorValidator
      : (type('object') as unknown as Type<E>)

  const buildUrl = (endpoint: string, params?: Record<string, boolean | number | string>) => {
    const url = new URL(endpoint, baseUrl || undefined)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value))
      }
    }
    return url
  }

  // FIX 4: Ensure generic default matches interface (T = undefined)
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

    // FIX 5: Explicitly return undefined, matching T's default
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
