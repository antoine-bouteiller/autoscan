import { Clock, Effect, Random } from 'effect'
import { z } from 'zod'

import { HttpError, RequestTimeoutError } from '@/shared/errors/http'
import { NetworkError } from '@/shared/errors/network'
import { ValidationError } from '@/shared/errors/validation'
import {
  type AnySchema,
  type GetOptionWithoutResponse,
  type GetOptions,
  type HttpClient,
  type HttpClientError,
  type HttpClientOptions,
  type HttpClientResult,
  type HttpClientVoidResult,
  type RequestOptions,
  type RequestParams,
  type RequestWithoutResponseOption,
} from '@/shared/types/http_client'

const DEFAULT_TIMEOUT = 30_000
const RETRY_DELAYS = [250, 500] as const

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

const parseBody = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

const parseRetryAfter = (value: string | null, now: number): number | undefined => {
  if (value === null) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

const shouldRetry = (method: string, enabled: boolean, error: HttpClientError): boolean =>
  enabled && method === 'GET' && (error._tag === 'NetworkError' || (error._tag === 'HttpError' && (error.status === 429 || error.status >= 500)))

const retry = <Success>(
  request: () => Effect.Effect<Success, HttpClientError>,
  options: { attempt?: number; deadline: number; enabled: boolean; method: string }
): Effect.Effect<Success, HttpClientError> =>
  request().pipe(
    Effect.catch((error) => {
      const attempt = options.attempt ?? 0
      if (attempt >= RETRY_DELAYS.length || !shouldRetry(options.method, options.enabled, error)) {
        return Effect.fail(error)
      }

      const delay = Clock.currentTimeMillis.pipe(
        Effect.flatMap((now) => {
          const remaining = Math.max(0, options.deadline - now)
          if (error._tag === 'HttpError' && error.retryAfterMs !== undefined) {
            return Effect.succeed(Math.min(error.retryAfterMs, remaining))
          }
          const baseDelay = RETRY_DELAYS[attempt]
          return Random.next.pipe(Effect.map((random) => Math.min(baseDelay + Math.floor(baseDelay * random * 0.25), remaining)))
        })
      )

      return delay.pipe(
        Effect.flatMap((duration) => Effect.sleep(duration)),
        Effect.flatMap(() => retry(request, { ...options, attempt: attempt + 1 }))
      )
    })
  )

export const httpClient = ({ baseUrl = '', errorFormatter, headers: globalHeaders = {}, serviceName }: HttpClientOptions): HttpClient => {
  function request(method: string, endpoint: string, options?: RequestWithoutResponseOption): HttpClientVoidResult
  function request<TSchema extends AnySchema>(method: string, endpoint: string, options?: RequestOptions<TSchema>): HttpClientResult<TSchema>

  function request<TSchema extends AnySchema | undefined = undefined>(
    method: string,
    endpoint: string,
    options: RequestOptions<TSchema> = {}
  ): Effect.Effect<unknown, HttpClientError> {
    const { body, headers = {}, params, retry: retryEnabled = true, timeout = DEFAULT_TIMEOUT, validator } = options
    const url = createUrl(baseUrl, endpoint, params)

    const fetchOnce = Effect.scoped(
      Effect.gen(function* () {
        const signal = yield* Effect.abortSignal
        const response = yield* Effect.tryPromise({
          catch: (cause) =>
            new NetworkError({ cause, originalMessage: cause instanceof Error ? cause.message : 'Unknown network error', serviceName }),
          try: () =>
            fetch(url, {
              body: body === undefined ? undefined : JSON.stringify(body),
              headers: { ...globalHeaders, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
              method,
              signal,
            }),
        })

        if (!response.ok) {
          const text = yield* Effect.tryPromise({ catch: () => response.statusText, try: () => response.text() }).pipe(
            Effect.catch((error) => Effect.succeed(error))
          )
          const now = yield* Clock.currentTimeMillis
          return yield* new HttpError({
            body: (errorFormatter ?? defaultFormatter)(parseBody(text)),
            retryAfterMs: parseRetryAfter(response.headers.get('Retry-After'), now),
            route: endpoint,
            serviceName,
            status: response.status,
          })
        }

        if (validator === undefined) {
          yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve())
          return undefined
        }

        const json = yield* Effect.tryPromise({
          catch: (cause) => new ValidationError({ cause, details: 'Response is not valid JSON' }),
          try: () => response.json(),
        })
        const result = validator.safeParse(json)
        if (!result.success) {
          return yield* new ValidationError({ details: JSON.stringify(z.treeifyError(result.error)) })
        }

        return result.data
      })
    )

    return Clock.currentTimeMillis.pipe(
      Effect.flatMap((startedAt) => retry(() => fetchOnce, { deadline: startedAt + timeout, enabled: retryEnabled, method })),
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () => Effect.fail(new RequestTimeoutError({ route: endpoint, serviceName })),
      })
    )
  }

  return {
    delete: (url: string, options?: GetOptionWithoutResponse) => request('DELETE', url, options),
    get: (url: string, options?: GetOptions<AnySchema> | GetOptionWithoutResponse) => request('GET', url, options),
    patch: (url: string, options?: RequestWithoutResponseOption) => request('PATCH', url, options),
    post: (url: string, options?: RequestOptions<AnySchema> | RequestWithoutResponseOption) => request('POST', url, options),
    put: (url: string, options?: RequestWithoutResponseOption) => request('PUT', url, options),
  }
}
