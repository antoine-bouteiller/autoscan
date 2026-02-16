import { Schema } from 'effect'

const QueueItem = Schema.Struct({
  errorMessage: Schema.optional(Schema.String),
  id: Schema.Number,
  status: Schema.String,
  statusMessages: Schema.optional(
    Schema.Array(
      Schema.Struct({
        messages: Schema.Union(Schema.String, Schema.Unknown),
        title: Schema.String,
      })
    )
  ),
  title: Schema.String,
  trackedDownloadStatus: Schema.optional(Schema.String),
})

export const QueueResponse = Schema.Struct({
  records: Schema.Array(QueueItem),
  totalRecords: Schema.Number,
})
export type QueueResponse = typeof QueueResponse.Type
