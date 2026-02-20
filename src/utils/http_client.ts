import * as v from 'valibot'

import { HttpError, type HttpErrorFormatter } from '@/errors/http'
import { NetworkError } from '@/errors/network'
import { ValidationError } from '@/errors/validation'

type RequestResponse<T> = { ok: true; data: T } | { ok: false; error: HttpError | NetworkError | ValidationError }

type AnySchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
type OutputFromSchema<TSchema> = [TSchema] extends [undefined] ? undefined : TSchema extends AnySchema ? v.InferOutput<TSchema> : undefined
type RequestParams = Record<string, string | number | boolean>

interface RequestOptions<TSchema extends AnySchema | undefined = undefined> {
  body?: unknown
  headers?: Record<string, string>
  params?: RequestParams
  validator?: TSchema
}

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

  const request = async <TSchema extends AnySchema | undefined = undefined>(
    method: string,
    endpoint: string,
    options: RequestOptions<TSchema> = {}
  ): Promise<RequestResponse<OutputFromSchema<TSchema>>> => {
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
      return { ok: true, data: undefined as OutputFromSchema<TSchema> }
    }

    const json = await response.json().catch(() => undefined)

    const result = v.safeParse(validator, json)
    if (!result.success) {
      return { ok: false, error: new ValidationError(result.issues) }
    }

    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    return { ok: true, data: result.output as OutputFromSchema<TSchema> }
  }

  return {
    delete: <TSchema extends AnySchema | undefined = undefined>(url: string, opts?: Omit<RequestOptions<TSchema>, 'body'>) =>
      request('DELETE', url, opts),
    get: <TSchema extends AnySchema | undefined = undefined>(url: string, opts?: Omit<RequestOptions<TSchema>, 'body'>) => request('GET', url, opts),
    patch: <TSchema extends AnySchema | undefined = undefined>(url: string, opts?: RequestOptions<TSchema>) => request('PATCH', url, opts),
    post: <TSchema extends AnySchema | undefined = undefined>(url: string, opts?: RequestOptions<TSchema>) => request('POST', url, opts),
    put: <TSchema extends AnySchema | undefined = undefined>(url: string, opts?: RequestOptions<TSchema>) => request('PUT', url, opts),
  }
}
