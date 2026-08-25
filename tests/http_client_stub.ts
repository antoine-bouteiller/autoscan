import { Effect } from 'effect'
import { HttpClient, HttpClientError, HttpClientResponse, type HttpClientRequest } from 'effect/unstable/http'

interface StubCall {
  readonly request: HttpClientRequest.HttpClientRequest
  readonly signal: AbortSignal
  readonly url: URL
}

export type Responder = (call: StubCall) => Effect.Effect<Response, HttpClientError.HttpClientError>

export const transportFailure =
  (cause: unknown): Responder =>
  ({ request }) =>
    Effect.fail(new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ cause, request }) }))

export const httpStub = (responder: Responder) => {
  const calls: StubCall[] = []
  const client = HttpClient.make((request, url, signal) => {
    const call = { request, signal, url }
    calls.push(call)
    return responder(call).pipe(Effect.map((response) => HttpClientResponse.fromWeb(request, response)))
  })

  return { calls, client }
}
