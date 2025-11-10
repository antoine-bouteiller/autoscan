import { cleanupAll } from '@/app/services/media/cleanup_service'
import type { QueueResponse } from '@/types/cleaner'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock ky module
const mockKyGet = mock()
const mockKyDelete = mock()

const mockKyInstance = {
  delete: mockKyDelete,
  get: mockKyGet,
}

mock.module('ky', () => ({
  default: {
    create: () => mockKyInstance,
  },
}))

// Mock env
mock.module('@/config/env', () => ({
  default: {
    RADARR_API_KEY: 'test-radarr-key',
    RADARR_API_URL: 'http://radarr.test',
    SONARR_API_KEY: 'test-sonarr-key',
    SONARR_API_URL: 'http://sonarr.test',
  },
}))

describe('CleanupService', () => {
  beforeEach(() => {
    mockKyGet.mockReset()
    mockKyDelete.mockReset()
  })

  test('should remove items with no eligible files', async () => {
    const queueResponse: QueueResponse = {
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
          title: 'Test Movie',
        },
      ],
    }

    mockKyGet.mockReturnValue({
      json: mock().mockResolvedValue(queueResponse),
    })
    mockKyDelete.mockResolvedValue({})

    await cleanupAll()

    expect(mockKyDelete).toHaveBeenCalledTimes(2) // Once for Sonarr, once for Radarr
    expect(mockKyDelete).toHaveBeenCalledWith('queue/1', {
      searchParams: {
        blocklist: 'true',
        removeFromClient: 'true',
      },
    })
  })

  test('should remove items with dangerous file extensions', async () => {
    const queueResponse: QueueResponse = {
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
          title: 'Test Movie',
        },
      ],
    }

    mockKyGet.mockReturnValue({
      json: mock().mockResolvedValue(queueResponse),
    })
    mockKyDelete.mockResolvedValue({})

    await cleanupAll()

    expect(mockKyDelete).toHaveBeenCalledTimes(2)
  })

  test('should not remove items with stalled warning on first strike', async () => {
    const queueResponse: QueueResponse = {
      records: [
        {
          errorMessage: 'The download is stalled with no connections',
          id: 3,
          status: 'warning',
          statusMessages: [],
          title: 'Test Movie',
        },
      ],
    }

    mockKyGet.mockReturnValue({
      json: mock().mockResolvedValue(queueResponse),
    })

    await cleanupAll()

    expect(mockKyDelete).not.toHaveBeenCalled()
  })

  test('should handle empty queue', async () => {
    const queueResponse: QueueResponse = {
      records: [],
    }

    mockKyGet.mockReturnValue({
      json: mock().mockResolvedValue(queueResponse),
    })

    await cleanupAll()

    expect(mockKyDelete).not.toHaveBeenCalled()
  })

  test('should handle undefined queue response', async () => {
    mockKyGet.mockReturnValue({
      json: mock().mockResolvedValue(),
    })

    await cleanupAll()

    expect(mockKyDelete).not.toHaveBeenCalled()
  })

  test('should skip items with missing title or status', async () => {
    const queueResponse: QueueResponse = {
      records: [
        {
          errorMessage: '',
          id: 4,
          status: undefined as never,
          statusMessages: [],
          title: 'Test Movie',
        },
        {
          errorMessage: '',
          id: 5,
          status: 'completed',
          statusMessages: [],
          title: undefined as never,
        },
      ],
    }

    mockKyGet.mockReturnValue({
      json: mock().mockResolvedValue(queueResponse),
    })

    await cleanupAll()

    expect(mockKyDelete).not.toHaveBeenCalled()
  })

  test('should handle normal completed items without errors', async () => {
    const queueResponse: QueueResponse = {
      records: [
        {
          errorMessage: '',
          id: 6,
          status: 'completed',
          statusMessages: [],
          title: 'Test Movie',
        },
      ],
    }

    mockKyGet.mockReturnValue({
      json: mock().mockResolvedValue(queueResponse),
    })

    await cleanupAll()

    expect(mockKyDelete).not.toHaveBeenCalled()
  })
})
