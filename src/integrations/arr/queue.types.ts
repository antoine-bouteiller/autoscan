import { type Effect, Schema, SchemaGetter } from 'effect'

import { type HttpClientError } from '@/shared/types/http_client'

const timeleftValidator = Schema.NullOr(Schema.String).pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.String), {
    decode: SchemaGetter.transform((value) => value ?? undefined),
    encode: SchemaGetter.forbidden(() => 'Encoding is not supported'),
  })
)

const queueItemValidator = Schema.Struct({
  errorMessage: Schema.optional(Schema.String),
  id: Schema.Finite,
  status: Schema.String,
  statusMessages: Schema.optional(
    Schema.Array(
      Schema.Struct({
        messages: Schema.Union([Schema.String, Schema.Record(Schema.String, Schema.Unknown)]),
        title: Schema.String,
      })
    )
  ),
  timeleft: Schema.optional(timeleftValidator),
  title: Schema.String,
  trackedDownloadStatus: Schema.optional(Schema.String),
})

export const queueResponseValidator = Schema.Struct({ records: Schema.Array(queueItemValidator), totalRecords: Schema.Finite })
export type QueueResponse = typeof queueResponseValidator.Type

export interface QueueService {
  readonly getQueue: () => Effect.Effect<QueueResponse, HttpClientError>
  readonly removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => Effect.Effect<void, HttpClientError>
}
