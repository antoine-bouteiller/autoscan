import type { QueueResponse } from '@/features/cleanup/types'

export const mockQueueResponseWithNoEligibleFiles: QueueResponse = {
  records: [
    {
      errorMessage: '',
      id: 1,
      status: 'completed',
      statusMessages: [
        {
          messages: 'No files found are eligible for import',
          title: 'Error',
        },
      ],
      title: 'Test Movie',
    },
  ],
  totalRecords: 1,
}

export const mockQueueResponseWithDangerousFiles: QueueResponse = {
  records: [
    {
      errorMessage: '',
      id: 2,
      status: 'completed',
      statusMessages: [
        {
          messages: 'Caution: Found potentially dangerous file with extension: .exe',
          title: 'Warning',
        },
      ],
      title: 'Test Movie',
    },
  ],
  totalRecords: 1,
}

export const mockQueueResponseWithStalledWarning: QueueResponse = {
  records: [
    {
      errorMessage: 'The download is stalled with no connections',
      id: 3,
      status: 'warning',
      statusMessages: [],
      title: 'Test Movie',
    },
  ],
  totalRecords: 1,
}

export const mockQueueResponseEmpty: QueueResponse = {
  records: [],
  totalRecords: 0,
}

export const mockQueueResponseNormal: QueueResponse = {
  records: [
    {
      errorMessage: '',
      id: 6,
      status: 'completed',
      statusMessages: [],
      title: 'Test Movie',
    },
  ],
  totalRecords: 1,
}
