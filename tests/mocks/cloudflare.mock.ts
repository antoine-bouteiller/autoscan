import { vi } from 'vite-plus/test'

import { type ICloudflareClient } from '#integrations/cloudflare.service'

export const mockGetZoneId = vi.fn<ICloudflareClient['getZoneId']>(() => Promise.resolve('zone-123'))
export const mockGetARecord = vi.fn<ICloudflareClient['getARecord']>()
export const mockUpdateDnsRecord = vi.fn<ICloudflareClient['updateDnsRecord']>()

export class MockCloudflareClient implements ICloudflareClient {
  async getPublicIP() {
    return '1.2.3.4'
  }

  getZoneId = mockGetZoneId

  getARecord = mockGetARecord

  updateDnsRecord = mockUpdateDnsRecord
}
