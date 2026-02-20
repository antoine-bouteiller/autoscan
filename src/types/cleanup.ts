import * as v from 'valibot'

const queueItemValidator = v.object({
  errorMessage: v.optional(v.string()),
  id: v.number(),
  status: v.string(),
  statusMessages: v.optional(
    v.array(
      v.object({
        messages: v.union([v.string(), v.record(v.string(), v.unknown())]),
        title: v.string(),
      })
    )
  ),
  title: v.string(),
  trackedDownloadStatus: v.optional(v.string()),
})

export const queueResponseValidator = v.object({
  records: v.array(queueItemValidator),
  totalRecords: v.number(),
})

export type QueueResponse = v.InferOutput<typeof queueResponseValidator>

export interface QueueService {
  getQueue: () => Promise<QueueResponse | undefined>
  removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => Promise<void>
}
