import { Effect } from 'effect'

import { DnsService } from '@/services/dns.service'

export const runDynDnsProcess = Effect.gen(function* () {
  const dnsService = yield* DnsService
  yield* dnsService.dynDns()
})
