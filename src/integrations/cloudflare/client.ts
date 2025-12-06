import type { RecordResponse } from 'cloudflare/resources/dns'

import Cloudflare from 'cloudflare'
import ky from 'ky'

import env from '@/config/env'

interface IpifyResponse {
  ip: string
}

const cloudflare = new Cloudflare({
  apiToken: env.CLOUDFLARE_TOKEN,
})

export const getPublicIP = async () => {
  const data = await ky<IpifyResponse>('https://api.ipify.org?format=json').json()

  return data.ip
}

export const getZoneId = async (zoneName: string): Promise<string> => {
  const zonesResp = await cloudflare.zones.list({
    name: zoneName,
  })

  const [zone] = zonesResp.result

  if (!zone) {
    throw new Error(`(Cloudflare) Zone not found`)
  }

  return zone.id
}

export const getARecord = (recordName: string, zoneId: string) =>
  cloudflare.dns.records.list({
    name: { exact: recordName },
    type: 'A',
    zone_id: zoneId,
  })

export const updateDnsRecord = async (record: RecordResponse, ip: string, zoneId: string) => {
  await cloudflare.dns.records.update(record.id, {
    content: ip,
    name: record.name,
    ttl: record.ttl,
    type: record.type,
    zone_id: zoneId,
  })
}
