import { FetchHttpClient, HttpClient } from '@effect/platform'
import { Effect, Redacted } from 'effect'

import { AppConfig } from '@/config/app_config'
import { makeHttpClient } from '@/config/http_client'
import { CloudflareZoneNotFoundError, NetworkError } from '@/errors'
import { DnsRecordsResponse, IpifyResponse, ZonesResponse, type DnsRecord } from '@/schemas/cloudflare'

export class CloudflareClient extends Effect.Service<CloudflareClient>()('CloudflareClient', {
  accessors: true,
  dependencies: [AppConfig.Default, FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const config = yield* AppConfig
    const client = yield* HttpClient.HttpClient

    const ipify = makeHttpClient(client, 'https://api.ipify.org/')
    const cf = makeHttpClient(client, 'https://api.cloudflare.com/client/v4/', {
      Authorization: `Bearer ${Redacted.value(config.CLOUDFLARE_TOKEN)}`,
    })

    const getPublicIP = Effect.fn('CloudflareClient.getPublicIP')(() =>
      ipify.get('', IpifyResponse, { format: 'json' }).pipe(
        Effect.map((data) => data.ip),
        Effect.mapError(mapHttpError('ipify'))
      )
    )

    const getZoneId = Effect.fn('CloudflareClient.getZoneId')((zoneName: string) =>
      cf.get('zones', ZonesResponse, { name: zoneName }).pipe(
        Effect.mapError(mapHttpError('Cloudflare')),
        Effect.flatMap((data) => {
          const [zone] = data.result
          if (!zone) {
            return Effect.fail(
              new CloudflareZoneNotFoundError({
                message: `(Cloudflare) Zone not found: ${zoneName}`,
                zoneName,
              })
            )
          }
          return Effect.succeed(zone.id)
        })
      )
    )

    const getARecord = Effect.fn('CloudflareClient.getARecord')((recordName: string, zoneId: string) =>
      cf
        .get(`zones/${zoneId}/dns_records`, DnsRecordsResponse, { name: recordName, type: 'A' })
        .pipe(Effect.catchAll((error) => Effect.logError(`(Cloudflare) ${String(error)}`).pipe(Effect.as(undefined))))
    )

    const updateDnsRecord = Effect.fn('CloudflareClient.updateDnsRecord')((record: DnsRecord, ip: string, zoneId: string) =>
      cf
        .patch(`zones/${zoneId}/dns_records/${record.id}`, {
          content: ip,
          name: record.name,
          ttl: record.ttl,
          type: record.type,
        })
        .pipe(
          Effect.catchAll((error) =>
            Effect.logError(`(Cloudflare) ${error instanceof Error ? error.message : JSON.stringify(error)}`).pipe(Effect.asVoid)
          )
        )
    )

    return {
      getARecord,
      getPublicIP,
      getZoneId,
      updateDnsRecord,
    }
  }),
}) {}

const mapHttpError = (serviceName: string) => (error: unknown) =>
  new NetworkError({
    message: `(${serviceName}) Network Error: ${String(error)}`,
    originalMessage: String(error),
    serviceName,
  })
