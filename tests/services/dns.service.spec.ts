import { beforeEach, describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'

import { DnsService } from '@/services/dns.service'

import { MockAppConfigLayer } from '../config'
import { MockCloudflareLayer, mockGetARecord, mockGetZoneId, mockUpdateDnsRecord } from '../mocks/cloudflare.mock'
import { differentIpRecord, emptyRecord, sameIpRecord } from '../resources/fixtures/cloudflare.fixtures'

const TestLayer = DnsService.DefaultWithoutDependencies.pipe(Layer.provide(MockCloudflareLayer), Layer.provide(MockAppConfigLayer))

describe('DnsService', () => {
  beforeEach(() => {
    mockGetZoneId.mockClear()
    mockGetARecord.mockReset()
    mockUpdateDnsRecord.mockClear()
    mockGetZoneId.mockImplementation((_zoneName: string) => Effect.succeed('zone-123'))
  })

  describe('handleUpdateIp', () => {
    it.effect('should skip update when IP has not changed', () => {
      mockGetARecord.mockImplementation(() => Effect.succeed(sameIpRecord))

      return Effect.gen(function* () {
        const dns = yield* DnsService
        yield* dns.handleUpdateIp('example.com')
        expect(mockUpdateDnsRecord).not.toHaveBeenCalled()
      }).pipe(Effect.provide(TestLayer))
    })

    it.effect('should update DNS when IP has changed', () => {
      mockGetARecord.mockImplementation(() => Effect.succeed(differentIpRecord))

      return Effect.gen(function* () {
        const dns = yield* DnsService
        yield* dns.handleUpdateIp('example.com')
        expect(mockUpdateDnsRecord).toHaveBeenCalledTimes(1)
        expect(mockUpdateDnsRecord).toHaveBeenCalledWith(differentIpRecord.result[0], '1.2.3.4', 'zone-123')
      }).pipe(Effect.provide(TestLayer))
    })

    it.effect('should fail when no record found in results', () => {
      mockGetARecord.mockImplementation(() => Effect.succeed(emptyRecord))

      return Effect.gen(function* () {
        const dns = yield* DnsService
        yield* dns.handleUpdateIp('example.com')
      }).pipe(
        Effect.provide(TestLayer),
        Effect.flip,
        Effect.map((error) => expect(error).toBeDefined())
      )
    })

    it.effect('should cache zoneId across calls', () => {
      mockGetARecord.mockImplementation(() => Effect.succeed(sameIpRecord))

      return Effect.gen(function* () {
        const dns = yield* DnsService
        yield* dns.handleUpdateIp('example.com')
        yield* dns.handleUpdateIp('example.com')
        expect(mockGetZoneId).toHaveBeenCalledTimes(1)
      }).pipe(Effect.provide(TestLayer))
    })
  })
})
