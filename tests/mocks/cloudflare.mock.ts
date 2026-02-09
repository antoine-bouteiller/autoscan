import { mock } from 'bun:test'

import type { ICloudflareClient } from '@/integrations/cloudflare.service'

export const mockGetZoneId = mock<ICloudflareClient['getZoneId']>(() => Promise.resolve('zone-123'))
export const mockGetARecord = mock<ICloudflareClient['getARecord']>()
export const mockUpdateDnsRecord = mock<ICloudflareClient['updateDnsRecord']>()

export class MockCloudflareClient implements ICloudflareClient {
  async getPublicIP() {
    return '1.2.3.4'
  }

  async getZoneId(zoneName: string) {
    return mockGetZoneId(zoneName)
  }

  async getARecord(recordName: string, zoneId: string) {
    return mockGetARecord(recordName, zoneId)
  }

  async updateDnsRecord(record: Parameters<ICloudflareClient['updateDnsRecord']>[0], ip: string, zoneId: string) {
    void mockUpdateDnsRecord(record, ip, zoneId)
  }
}
