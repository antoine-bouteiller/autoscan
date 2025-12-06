export interface QueueItem {
  errorMessage?: string
  id: number
  status: string
  statusMessages?: { messages: string; title: string }[]
  title: string
  trackedDownloadStatus?: string
}

export interface QueueResponse {
  records: QueueItem[]
  totalRecords: number
}
