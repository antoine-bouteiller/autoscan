import { type Effect } from 'effect'
import { z } from 'zod'

import { type HttpClientError } from '@/shared/types/http_client'

const queueItemValidator = z.object({
  errorMessage: z.string().optional(),
  id: z.number(),
  status: z.string(),
  statusMessages: z
    .array(
      z.object({
        messages: z.union([z.string(), z.record(z.string(), z.unknown())]),
        title: z.string(),
      })
    )
    .optional(),
  timeleft: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  title: z.string(),
  trackedDownloadStatus: z.string().optional(),
})

export const queueResponseValidator = z.object({ records: z.array(queueItemValidator), totalRecords: z.number() })
export type QueueResponse = z.infer<typeof queueResponseValidator>

export interface QueueService {
  readonly getQueue: () => Effect.Effect<QueueResponse, HttpClientError>
  readonly removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => Effect.Effect<void, HttpClientError>
}
