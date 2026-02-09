import { type } from 'arktype'

const queueItemValidator = type({
  'errorMessage?': 'string',
  id: 'number',
  status: 'string',
  'statusMessages?': type({
    messages: 'string | object',
    title: 'string',
  }).array(),
  title: 'string',
  'trackedDownloadStatus?': 'string',
})

export const queueResponseValidator = type({
  records: queueItemValidator.array(),
  totalRecords: 'number',
})

export type QueueResponse = typeof queueResponseValidator.infer

export interface QueueService {
  getQueue: () => Promise<QueueResponse | undefined>
  removeQueueItem: (id: number, options: { blocklist: boolean; removeFromClient: boolean }) => Promise<void>
}
