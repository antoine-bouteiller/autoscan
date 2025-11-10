import { dynDns } from '@/app/services/integrations/ip_service'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock ky
const mockKy = mock()
mock.module('ky', () => ({
  default: mockKy,
}))

// Mock Cloudflare SDK
const mockZonesList = mock()
const mockDnsRecordsList = mock()
const mockDnsRecordsEdit = mock()

const mockCloudflare = mock(() => ({
  dns: {
    records: {
      edit: mockDnsRecordsEdit,
      list: mockDnsRecordsList,
    },
  },
  zones: {
    list: mockZonesList,
  },
}))

mock.module('cloudflare', () => ({
  default: mockCloudflare,
}))

// Mock env
mock.module('@/config/env', () => ({
  default: {
    CLOUDFLARE_TOKEN: 'test-token',
    DOMAIN: 'example.com',
  },
}))

describe('IpService', () => {
  beforeEach(() => {
    mockKy.mockReset()
    mockZonesList.mockReset()
    mockDnsRecordsList.mockReset()
    mockDnsRecordsEdit.mockReset()
  })

  test('should update DNS records when IP changes', async () => {
    // Mock ipify response
    mockKy.mockResolvedValue({
      json: mock().mockResolvedValue({ ip: '1.2.3.4' }),
    })

    // Mock Cloudflare zones list
    mockZonesList.mockResolvedValue({
      result: [{ id: 'zone-123', name: 'example.com' }],
    })

    // Mock DNS records list
    mockDnsRecordsList
      .mockResolvedValueOnce({
        result: [
          {
            content: '5.6.7.8', // Different IP
            id: 'record-1',
            name: 'example.com',
            proxied: true,
            ttl: 1,
            type: 'A',
          },
        ],
      })
      .mockResolvedValueOnce({
        result: [
          {
            content: '5.6.7.8', // Different IP
            id: 'record-2',
            name: '*.example.com',
            proxied: true,
            ttl: 1,
            type: 'A',
          },
        ],
      })

    mockDnsRecordsEdit.mockResolvedValue({})

    dynDns()

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockZonesList).toHaveBeenCalled()
    expect(mockDnsRecordsList).toHaveBeenCalledTimes(2)
    expect(mockDnsRecordsEdit).toHaveBeenCalledTimes(2)
    expect(mockDnsRecordsEdit).toHaveBeenCalledWith('record-1', {
      content: '1.2.3.4',
      name: 'example.com',
      proxied: true,
      ttl: 1,
      type: 'A',
      zone_id: 'zone-123',
    })
  })

  test('should not update DNS records when IP is the same', async () => {
    // Mock ipify response
    mockKy.mockResolvedValue({
      json: mock().mockResolvedValue({ ip: '1.2.3.4' }),
    })

    // Mock Cloudflare zones list
    mockZonesList.mockResolvedValue({
      result: [{ id: 'zone-456', name: 'example.com' }],
    })

    // Mock DNS records list
    mockDnsRecordsList.mockResolvedValue({
      result: [
        {
          content: '1.2.3.4', // Same IP
          id: 'record-3',
          name: 'example.com',
          proxied: false,
          ttl: 300,
          type: 'A',
        },
      ],
    })

    dynDns()

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockZonesList).toHaveBeenCalled()
    expect(mockDnsRecordsList).toHaveBeenCalled()
    expect(mockDnsRecordsEdit).not.toHaveBeenCalled()
  })

  test('should handle missing zone', async () => {
    // Mock ipify response
    mockKy.mockResolvedValue({
      json: mock().mockResolvedValue({ ip: '1.2.3.4' }),
    })

    // Mock Cloudflare zones list with no results
    mockZonesList.mockResolvedValue({
      result: [],
    })

    dynDns()

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockZonesList).toHaveBeenCalled()
    expect(mockDnsRecordsList).not.toHaveBeenCalled()
    expect(mockDnsRecordsEdit).not.toHaveBeenCalled()
  })

  test('should handle missing DNS record', async () => {
    // Mock ipify response
    mockKy.mockResolvedValue({
      json: mock().mockResolvedValue({ ip: '1.2.3.4' }),
    })

    // Mock Cloudflare zones list
    mockZonesList.mockResolvedValue({
      result: [{ id: 'zone-789', name: 'example.com' }],
    })

    // Mock DNS records list with no results
    mockDnsRecordsList.mockResolvedValue({
      result: [],
    })

    dynDns()

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockZonesList).toHaveBeenCalled()
    expect(mockDnsRecordsList).toHaveBeenCalled()
    expect(mockDnsRecordsEdit).not.toHaveBeenCalled()
  })

  test('should cache zone ID after first call', async () => {
    // Mock ipify response
    mockKy.mockResolvedValue({
      json: mock().mockResolvedValue({ ip: '1.2.3.4' }),
    })

    // Mock Cloudflare zones list
    mockZonesList.mockResolvedValue({
      result: [{ id: 'zone-cached', name: 'example.com' }],
    })

    // Mock DNS records list
    mockDnsRecordsList.mockResolvedValue({
      result: [
        {
          content: '1.2.3.4', // Same IP
          id: 'record-4',
          name: 'example.com',
          proxied: false,
          ttl: 300,
          type: 'A',
        },
      ],
    })

    // Call twice to test caching
    dynDns()
    await new Promise((resolve) => setTimeout(resolve, 100))

    dynDns()
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Zone list should only be called once due to caching
    expect(mockZonesList).toHaveBeenCalledTimes(1)
  })
})
