import env from '@/config/env'
import { logError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import { cloudflareErrorFormatter, CloudflareZoneNotFoundError } from './errors'
import { type DnsRecord, dnsRecordsResponseValidator, ipifyResponseValidator, zonesResponseValidator } from './validators'

const ipifyClient = httpClient({
  baseUrl: 'https://api.ipify.org/',
  serviceName: 'ipify',
})

const cloudflareClient = httpClient({
  baseUrl: 'https://api.cloudflare.com/client/v4/',
  errorFormatter: cloudflareErrorFormatter,
  headers: {
    Authorization: `Bearer ${env.CLOUDFLARE_TOKEN}`,
  },
  serviceName: 'Cloudflare',
})

export const getPublicIP = async () => {
  const result = await ipifyClient.get('', {
    params: { format: 'json' },
    validator: ipifyResponseValidator,
  })

  if (!result.ok) {
    throw result.error
  }

  return result.data.ip
}

export const getZoneId = async (zoneName: string): Promise<string> => {
  const result = await cloudflareClient.get('zones', {
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

export const getARecord = async (recordName: string, zoneId: string) => {
  const result = await cloudflareClient.get(`zones/${zoneId}/dns_records`, {
    params: { name: recordName, type: 'A' },
    validator: dnsRecordsResponseValidator,
  })

  if (!result.ok) {
    logError(result.error)
    return undefined
  }

  return result.data
}

export const updateDnsRecord = async (record: DnsRecord, ip: string, zoneId: string) => {
  const result = await cloudflareClient.patch(`zones/${zoneId}/dns_records/${record.id}`, {
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
