import { beforeEach, describe, expect, test } from 'bun:test'

import { container, TOKENS } from '@/core/container'

import '../config'
import type { TestCloudflareClient } from '../mocks'

const { dynDns, handleUpdateIp, resetZoneIdCache } = await import('@/services/dns.service')

describe('DnsService', () => {
  let testCloudflareClient: TestCloudflareClient

  beforeEach(() => {
    testCloudflareClient = container.resolve<TestCloudflareClient>(TOKENS.CLOUDFLARE_CLIENT)
    testCloudflareClient.getARecord.mockReset()
    testCloudflareClient.getZoneId.mockClear()
    resetZoneIdCache()
  })

  describe('handleUpdateIp', () => {
    test('should skip update when IP has not changed', async () => {
      testCloudflareClient.getARecord.mockResolvedValue({
        result: [{ id: 'rec-1', name: 'example.com', content: '1.2.3.4', ttl: 1, type: 'A' }],
        success: true,
      })

      await handleUpdateIp('example.com')

      expect(testCloudflareClient.updateDnsRecord).not.toHaveBeenCalled()
    })

    test('should update DNS when IP has changed', async () => {
      const record = { id: 'rec-1', name: 'example.com', content: '5.6.7.8', ttl: 1, type: 'A' }
      testCloudflareClient.getARecord.mockResolvedValue({ result: [record], success: true })

      await handleUpdateIp('example.com')

      expect(testCloudflareClient.updateDnsRecord).toHaveBeenCalledWith(record, '1.2.3.4', 'zone-123')
    })

    test('should throw when no record found in results', async () => {
      testCloudflareClient.getARecord.mockResolvedValue({ result: [], success: true })

      expect(handleUpdateIp('example.com')).rejects.toThrow('Record not found')
    })

    test('should cache zoneId across calls', async () => {
      testCloudflareClient.getARecord.mockResolvedValue({
        result: [{ id: 'rec-1', name: 'example.com', content: '1.2.3.4', ttl: 1, type: 'A' }],
        success: true,
      })

      await handleUpdateIp('example.com')
      await handleUpdateIp('example.com')

      expect(testCloudflareClient.getZoneId).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetZoneIdCache', () => {
    test('should force zoneId to be fetched again after reset', async () => {
      testCloudflareClient.getARecord.mockResolvedValue({
        result: [{ id: 'rec-1', name: 'example.com', content: '1.2.3.4', ttl: 1, type: 'A' }],
        success: true,
      })

      await handleUpdateIp('example.com')
      resetZoneIdCache()
      await handleUpdateIp('example.com')

      expect(testCloudflareClient.getZoneId).toHaveBeenCalledTimes(2)
    })
  })

  describe('dynDns', () => {
    test('should call handleUpdateIp for each domain', async () => {
      testCloudflareClient.getARecord.mockResolvedValue({
        result: [{ id: 'rec-1', name: 'example.com', content: '1.2.3.4', ttl: 1, type: 'A' }],
        success: true,
      })

      await dynDns()

      expect(testCloudflareClient.getARecord).toHaveBeenCalledTimes(2)
    })

    test('should not throw when one domain fails', async () => {
      testCloudflareClient.getARecord.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce({
        result: [{ id: 'rec-1', name: '*.example.com', content: '1.2.3.4', ttl: 1, type: 'A' }],
        success: true,
      })

      expect(dynDns()).resolves.toBeUndefined()
    })
  })
})
