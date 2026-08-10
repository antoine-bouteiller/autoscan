import { type QueueResponse } from '@/integrations/arr/queue.types'

export const mockQueueResponseWithNoEligibleFiles: QueueResponse = {
  records: [
    {
      errorMessage: '',
      id: 1,
      status: 'completed',
      statusMessages: [
        {
          messages: ['No files found are eligible for import'],
          title: 'Error',
        },
      ],
      timeleft: undefined,
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
          messages: ['Caution: Found potentially dangerous file with extension: .exe'],
          title: 'Warning',
        },
      ],
      timeleft: undefined,
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
      timeleft: undefined,
      title: 'Test Movie',
    },
  ],
  totalRecords: 1,
}

export const mockQueueResponseWithPersistentStall: QueueResponse = {
  records: [
    {
      errorMessage: 'The download is stalled with no connections',
      id: 99,
      status: 'warning',
      statusMessages: [],
      timeleft: undefined,
      title: 'Slow.Horses.S03E03.1080p.WEB-DL',
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
      timeleft: undefined,
      title: 'Test Movie',
    },
  ],
  totalRecords: 1,
}
