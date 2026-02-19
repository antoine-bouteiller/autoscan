import { beforeEach, describe, expect, test } from 'vitest'

import { dynDns, handleUpdateIp, resetZoneIdCache } from '@/services/dns.service'

import '../config'
import { mockGetARecord, mockGetZoneId, mockUpdateDnsRecord } from '../mocks/cloudflare.mock'
import { differentIpRecord, emptyRecord, sameIpRecord, wildcardSameIpRecord } from '../resources/fixtures/cloudflare.fixtures'

describe('DnsService', () => {
  beforeEach(() => {
    mockGetZoneId.mockClear()
    mockGetARecord.mockReset()
    mockUpdateDnsRecord.mockReset()
    resetZoneIdCache()
  })

  describe('handleUpdateIp', () => {
    test('should skip update when IP has not changed', async () => {
      mockGetARecord.mockResolvedValue(sameIpRecord)

      await handleUpdateIp('example.com')

      expect(mockUpdateDnsRecord).not.toHaveBeenCalled()
    })

    test('should update DNS when IP has changed', async () => {
      mockGetARecord.mockResolvedValue(differentIpRecord)

      await handleUpdateIp('example.com')

      expect(mockUpdateDnsRecord).toHaveBeenCalledTimes(1)
      expect(mockUpdateDnsRecord).toHaveBeenCalledWith(differentIpRecord.result[0], '1.2.3.4', 'zone-123')
    })

    test('should throw when no record found in results', async () => {
      mockGetARecord.mockResolvedValue(emptyRecord)

      await expect(handleUpdateIp('example.com')).rejects.toThrow('Record not found')
    })

    test('should cache zoneId across calls', async () => {
      mockGetARecord.mockResolvedValue(sameIpRecord)

      await handleUpdateIp('example.com')
      await handleUpdateIp('example.com')

      expect(mockGetZoneId).toHaveBeenCalledTimes(1)
    })
  })

  describe('dynDns', () => {
    test('should not throw when one domain fails', async () => {
      mockGetARecord.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(wildcardSameIpRecord)

      await expect(dynDns()).resolves.toBeUndefined()
    })
  })
})
