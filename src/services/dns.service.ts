import { Effect, Ref } from 'effect'

import { AppConfig } from '@/config/app_config'
import { CloudflareRecordNotFoundError } from '@/errors'
import { CloudflareClient } from '@/integrations/cloudflare.service'

export class DnsService extends Effect.Service<DnsService>()('DnsService', {
  accessors: true,
  dependencies: [AppConfig.Default, CloudflareClient.Default],
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const cloudflare = yield* CloudflareClient
    const zoneIdRef = yield* Ref.make('')

    const domainsToUpdate = [config.DOMAIN, `*.${config.DOMAIN}`]

    const handleUpdateIp = Effect.fn('DnsService.handleUpdateIp')(function* (recordName: string) {
      let zoneId = yield* Ref.get(zoneIdRef)
      if (!zoneId) {
        zoneId = yield* cloudflare.getZoneId(config.DOMAIN)
        yield* Ref.set(zoneIdRef, zoneId)
      }

      const data = yield* cloudflare.getARecord(recordName, zoneId)
      if (!data) {
        return
      }

      const [record] = data.result
      if (!record) {
        return yield* new CloudflareRecordNotFoundError({
          message: `(Cloudflare) Record not found for domain ${recordName}`,
          recordName,
        })
      }

      const currentIp = yield* cloudflare.getPublicIP()
      if (record.content === currentIp) {
        return
      }

      yield* cloudflare.updateDnsRecord(record, currentIp, zoneId)
    })

    const dynDns = Effect.fn('DnsService.dynDns')(function* () {
      for (const recordName of domainsToUpdate) {
        yield* handleUpdateIp(recordName).pipe(Effect.catchAll((e) => Effect.logError(String(e))))
      }
    })

    const resetZoneIdCache = Effect.fn('DnsService.resetZoneIdCache')(function* () {
      yield* Ref.set(zoneIdRef, '')
    })

    return {
      dynDns,
      handleUpdateIp,
      resetZoneIdCache,
    }
  }),
}) {}
