export interface QueueItem {
  id: number
  errorMessage?: string
  status: string
  statusMessages?: { messages: string; title: string }[]
  title: string
  trackedDownloadStatus?: string
}

export interface QueueResponse {
  records: QueueItem[]
  totalRecords: number
}
