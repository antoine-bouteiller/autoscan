import { Effect, Layer } from 'effect'
import { vi } from 'vitest'

import { CloudflareClient } from '@/integrations/cloudflare.service'
import type { DnsRecord } from '@/schemas/cloudflare'

export const mockGetZoneId = vi.fn<InstanceType<typeof CloudflareClient>['getZoneId']>(() => Effect.succeed('zone-123'))
export const mockGetARecord = vi.fn<InstanceType<typeof CloudflareClient>['getARecord']>(() => Effect.succeed(undefined))
export const mockUpdateDnsRecord = vi.fn<InstanceType<typeof CloudflareClient>['updateDnsRecord']>(() => Effect.void)

export const MockCloudflareLayer = Layer.succeed(
  CloudflareClient,
  CloudflareClient.make({
    getPublicIP: () => Effect.succeed('1.2.3.4'),
    getZoneId: (zoneName: string) => mockGetZoneId(zoneName),
    getARecord: (recordName: string, zoneId: string) => mockGetARecord(recordName, zoneId),
    updateDnsRecord: (record: DnsRecord, ip: string, zoneId: string) => mockUpdateDnsRecord(record, ip, zoneId),
  })
)
