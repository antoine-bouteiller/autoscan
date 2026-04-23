import { cloudflareErrorFormatter, CloudflareZoneNotFoundError } from '#/features/dynamic_dns/errors'
import {
  dnsRecordsResponseValidator,
  ipifyResponseValidator,
  zonesResponseValidator,
  type DnsRecord,
} from '#/integrations/cloudflare/cloudflare.validator'
import { type HttpError } from '#/shared/errors/http'
import { type NetworkError } from '#/shared/errors/network'
import { type ValidationError } from '#/shared/errors/validation'
import { isError, logError } from '#/shared/utils/error'
import { httpClient } from '#/shared/utils/http_client'

export interface ICloudflareClient {
  getPublicIP(): Promise<HttpError | NetworkError | ValidationError | string>
  getZoneId(zoneName: string): Promise<HttpError | NetworkError | ValidationError | CloudflareZoneNotFoundError | string>
  getARecord(recordName: string, zoneId: string): Promise<{ result: DnsRecord[]; success: boolean } | undefined>
  updateDnsRecord(record: DnsRecord, ip: string, zoneId: string): Promise<void>
}

interface CloudflareClientConfig {
  token: string
}

export class CloudflareClient implements ICloudflareClient {
  private readonly cloudflareClient: ReturnType<typeof httpClient>
  private readonly ipifyClient: ReturnType<typeof httpClient>

  constructor(config: CloudflareClientConfig) {
    this.ipifyClient = httpClient({
      baseUrl: 'https://api.ipify.org/',
      serviceName: 'ipify',
    })

    this.cloudflareClient = httpClient({
      baseUrl: 'https://api.cloudflare.com/client/v4/',
      errorFormatter: cloudflareErrorFormatter,
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      serviceName: 'Cloudflare',
    })
  }

  async getPublicIP() {
    const result = await this.ipifyClient.get('', {
      params: { format: 'json' },
      validator: ipifyResponseValidator,
    })

    if (isError(result)) {
      return result
    }

    return result.ip
  }

  async getZoneId(zoneName: string) {
    const result = await this.cloudflareClient.get('zones', {
      params: { name: zoneName },
      validator: zonesResponseValidator,
    })

    if (isError(result)) {
      return result
    }

    const [zone] = result.result

    if (!zone) {
      return new CloudflareZoneNotFoundError({ zoneName })
    }

    return zone.id
  }

  async getARecord(recordName: string, zoneId: string) {
    const result = await this.cloudflareClient.get(`zones/${zoneId}/dns_records`, {
      params: { name: recordName, type: 'A' },
      validator: dnsRecordsResponseValidator,
    })

    if (isError(result)) {
      logError(result)
      return undefined
    }

    return result
  }

  async updateDnsRecord(record: DnsRecord, ip: string, zoneId: string) {
    const result = await this.cloudflareClient.patch(`zones/${zoneId}/dns_records/${record.id}`, {
      body: {
        content: ip,
        name: record.name,
        ttl: record.ttl,
        type: record.type,
      },
    })

    if (isError(result)) {
      logError(result)
    }
  }
}
