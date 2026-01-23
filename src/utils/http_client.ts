import { ArkErrors, type Type } from 'arktype'

import { HttpError, type HttpErrorFormatter, NetworkError, ValidationError } from '@/errors'

export type RequestResponse<T> = { ok: true; data: T } | { ok: false; error: HttpError | NetworkError | ValidationError }

type InferType<T> = Type<T>['infer']

interface RequestOptions<T> {
  body?: unknown
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean>
  validator?: Type<T>
}

interface Options {
  baseUrl?: string
  errorFormatter?: HttpErrorFormatter
  headers?: Record<string, string>
  serviceName: string
}

export const httpClient = ({ baseUrl = '', errorFormatter, headers: globalHeaders = {}, serviceName }: Options) => {
  const createUrl = (endpoint: string, params?: RequestOptions<unknown>['params']) => {
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

  const request = async <TResponse = undefined>(
    method: string,
    endpoint: string,
    options: RequestOptions<TResponse> = {}
  ): Promise<RequestResponse<InferType<TResponse>>> => {
    const { body, headers = {}, params, validator } = options

    const url = createUrl(endpoint, params)

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          ...globalHeaders,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      return {
        ok: false,
        error: new NetworkError(serviceName, error instanceof Error ? error.message : 'Unknown network error'),
      }
    }

    if (!response.ok) {
      let errorData: unknown = response.statusText
      try {
        errorData = await response.json()
      } catch {
        // Keep statusText as errorData
      }

      return { ok: false, error: new HttpError(serviceName, response.status, errorData, errorFormatter) }
    }

    if (!validator) {
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
      return { ok: true, data: undefined as InferType<TResponse> }
    }

    const json = await response.json().catch(() => undefined)

    const result = validator(json)
    if (result instanceof ArkErrors) {
      return { ok: false, error: new ValidationError(result) }
    }

    return { ok: true, data: result }
  }

  return {
    delete: (url: string, opts?: Omit<RequestOptions<undefined>, 'body'>) => request('DELETE', url, opts),
    get: <T>(url: string, opts?: Omit<RequestOptions<T>, 'body'>) => request<T>('GET', url, opts),
    patch: (url: string, opts?: RequestOptions<undefined>) => request('PATCH', url, opts),
    post: (url: string, opts?: RequestOptions<undefined>) => request('POST', url, opts),
    put: (url: string, opts?: RequestOptions<undefined>) => request('PUT', url, opts),
  }
}
