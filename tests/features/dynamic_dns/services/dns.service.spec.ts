import { beforeEach, describe, expect, test } from 'vite-plus/test'

import { DnsRecordNotFoundError } from '#/features/dynamic_dns/errors'
import { dynDns, handleUpdateIp, resetZoneIdCache } from '#/features/dynamic_dns/services/dns.service'

import '../../../utils.ts'
import { mockGetARecord, mockGetZoneId, mockUpdateDnsRecord } from '../../../mocks/cloudflare.mock.js'
import { differentIpRecord, emptyRecord, sameIpRecord, wildcardSameIpRecord } from '../../../resources/fixtures/cloudflare.fixtures.js'

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

    test('should return DnsRecordNotFoundError when no record found in results', async () => {
      mockGetARecord.mockResolvedValue(emptyRecord)

      const result = await handleUpdateIp('example.com')
      expect(result).toBeInstanceOf(DnsRecordNotFoundError)
    })

    test('should cache zoneId across calls', async () => {
      mockGetARecord.mockResolvedValue(sameIpRecord)

      await handleUpdateIp('example.com')
      await handleUpdateIp('example.com')

      expect(mockGetZoneId).toHaveBeenCalledTimes(1)
    })
  })

  describe('dynDns', () => {
    test('should not throw when one domain returns no record', async () => {
      mockGetARecord.mockResolvedValueOnce(undefined).mockResolvedValueOnce(wildcardSameIpRecord)

      await expect(dynDns()).resolves.toBeUndefined()
    })
  })
})
