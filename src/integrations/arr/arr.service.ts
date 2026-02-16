import { HttpClient } from '@effect/platform'
import { Effect, Redacted } from 'effect'

import { makeHttpClient } from '@/config/http_client'
import { QueueResponse } from '@/schemas/queue'

export const makeArrClient = (baseUrl: string, apiKey: Redacted.Redacted, serviceName: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const api = makeHttpClient(client, `${baseUrl}/api/v3`, {
      'X-Api-Key': Redacted.value(apiKey),
    })

    return {
      ...api,
      getQueue: () =>
        api
          .get('queue', QueueResponse)
          .pipe(Effect.catchAll((error) => Effect.logError(`(${serviceName}) ${String(error)}`).pipe(Effect.as(undefined)))),

      removeQueueItem: (itemId: number, options: { blocklist: boolean; removeFromClient: boolean }) =>
        api
          .del(`queue/${itemId}`, {
            blocklist: String(options.blocklist),
            removeFromClient: String(options.removeFromClient),
          })
          .pipe(Effect.catchAll((error) => Effect.logError(`(${serviceName}) ${String(error)}`).pipe(Effect.as(undefined)))),
    }
  })
