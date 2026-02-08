import { cloudflareErrorFormatter, CloudflareZoneNotFoundError } from '@/errors/cloudflare'
import { logError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'
import { type DnsRecord, dnsRecordsResponseValidator, ipifyResponseValidator, zonesResponseValidator } from '@/validators/cloudflare.validator'

interface CloudflareClientConfig {
  token: string
}

export class CloudflareClient {
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

    if (!result.ok) {
      throw result.error
    }

    return result.data.ip
  }

  async getZoneId(zoneName: string): Promise<string> {
    const result = await this.cloudflareClient.get('zones', {
      params: { name: zoneName },
      validator: zonesResponseValidator,
    })

    if (!result.ok) {
      throw result.error
    }

    const [zone] = result.data.result

    if (!zone) {
      throw new CloudflareZoneNotFoundError(zoneName)
    }

    return zone.id
  }

  async getARecord(recordName: string, zoneId: string) {
    const result = await this.cloudflareClient.get(`zones/${zoneId}/dns_records`, {
      params: { name: recordName, type: 'A' },
      validator: dnsRecordsResponseValidator,
    })

    if (!result.ok) {
      logError(result.error)
      return undefined
    }

    return result.data
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

    if (!result.ok) {
      logError(result.error)
    }
  }
}
