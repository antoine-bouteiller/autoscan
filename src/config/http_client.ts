import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform'
import { type Schema, Effect } from 'effect'

export const makeHttpClient = (client: HttpClient.HttpClient, baseUrl: string, headers: Record<string, string> = {}) => {
  const configured = Object.entries(headers).reduce(
    (c, [key, value]) => c.pipe(HttpClient.mapRequest(HttpClientRequest.setHeader(key, value))),
    client.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl)))
  )

  const exec = (req: HttpClientRequest.HttpClientRequest) => configured.execute(req).pipe(Effect.scoped, Effect.asVoid)

  return {
    get: <A, I, R>(path: string, schema: Schema.Schema<A, I, R>, params?: Record<string, string>) => {
      let req = HttpClientRequest.get(path)
      if (params) {
        req = HttpClientRequest.setUrlParams(req, params)
      }
      return configured.execute(req).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)), Effect.scoped)
    },

    getVoid: (path: string, params?: Record<string, string>) => {
      let req = HttpClientRequest.get(path)
      if (params) {
        req = HttpClientRequest.setUrlParams(req, params)
      }
      return exec(req)
    },

    post: (path: string, body?: unknown) =>
      body
        ? HttpClientRequest.post(path).pipe(
            HttpClientRequest.bodyJson(body),
            Effect.flatMap((req) => configured.execute(req)),
            Effect.scoped,
            Effect.asVoid
          )
        : exec(HttpClientRequest.post(path)),

    put: (path: string, params?: Record<string, string>) => {
      let req = HttpClientRequest.put(path)
      if (params) {
        req = HttpClientRequest.setUrlParams(req, params)
      }
      return exec(req)
    },

    patch: (path: string, body: unknown) =>
      HttpClientRequest.patch(path).pipe(
        HttpClientRequest.bodyJson(body),
        Effect.flatMap((req) => configured.execute(req)),
        Effect.scoped,
        Effect.asVoid
      ),

    del: (path: string, params?: Record<string, string>) => {
      let req = HttpClientRequest.del(path)
      if (params) {
        req = HttpClientRequest.setUrlParams(req, params)
      }
      return exec(req)
    },
  }
}
