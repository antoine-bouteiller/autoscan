import env from '@/config/env'
import { httpClient } from '@/utils/http_client'

import {
  type DnsRecord,
  type DnsRecordsResponse,
  dnsRecordsResponseValidator,
  ipifyResponseValidator,
  zonesResponseValidator,
} from './validators'

const ipifyClient = httpClient({
  baseUrl: 'https://api.ipify.org',
})

const cloudflareClient = httpClient({
  baseUrl: 'https://api.cloudflare.com/client/v4',
  headers: {
    Authorization: `Bearer ${env.CLOUDFLARE_TOKEN}`,
  },
})

export const getPublicIP = async () => {
  const response = await ipifyClient.get('', {
    params: { format: 'json' },
    validator: ipifyResponseValidator,
  })
  return response.ip
}

export const getZoneId = async (zoneName: string): Promise<string> => {
  const zonesResp = await cloudflareClient.get('zones', {
    params: { name: zoneName },
    validator: zonesResponseValidator,
  })

  const [zone] = zonesResp.result

  if (!zone) {
    throw new Error(`(Cloudflare) Zone not found`)
  }

  return zone.id
}

export const getARecord = (recordName: string, zoneId: string): Promise<DnsRecordsResponse> =>
  cloudflareClient.get(`zones/${zoneId}/dns_records`, {
    params: { name: recordName, type: 'A' },
    validator: dnsRecordsResponseValidator,
  })

export const updateDnsRecord = async (record: DnsRecord, ip: string, zoneId: string) => {
  await cloudflareClient.patch(`zones/${zoneId}/dns_records/${record.id}`, {
    body: {
      content: ip,
      name: record.name,
      ttl: record.ttl,
      type: record.type,
    },
  })
}
