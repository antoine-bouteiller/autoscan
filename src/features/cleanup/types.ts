import { type } from 'arktype'

export const queueItemValidator = type({
  'errorMessage?': 'string',
  id: 'number',
  status: 'string',
  'statusMessages?': type({
    messages: 'string',
    title: 'string',
  }).array(),
  title: 'string',
  'trackedDownloadStatus?': 'string',
})

export const queueResponseValidator = type({
  records: queueItemValidator.array(),
  totalRecords: 'number',
})

export type QueueItem = typeof queueItemValidator.infer
export type QueueResponse = typeof queueResponseValidator.infer
