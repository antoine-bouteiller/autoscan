import { tryCatch } from '@/app/exceptions/handler'
import env from '@/config/env'
import Cloudflare from 'cloudflare'
import ky from 'ky'

interface IpifyResponse {
  ip: string
}

let zoneId: string

const DOMAINES_TO_UPDATE = [env.DOMAIN, `*.${env.DOMAIN}`]
const ZONE_NAME = env.DOMAIN

const cloudflare = new Cloudflare({
  apiToken: env.CLOUDFLARE_TOKEN,
})

async function getPublicIP() {
  const data = await ky<IpifyResponse>('https://api.ipify.org?format=json').json()

  return data.ip
}

async function getZoneId(): Promise<string> {
  if (zoneId) return zoneId

  const zonesResp = await cloudflare.zones.list({
    name: ZONE_NAME,
  })

  const zone = zonesResp.result[0]

  if (!zone) {
    throw new Error(`Zone not found`)
  }

  zoneId = zone.id
  return zone.id
}

async function updateDnsRecord(recordName: string) {
  const zoneId = await getZoneId()

  const listResp = await cloudflare.dns.records.list({
    zone_id: zoneId,
    name: { exact: recordName },
    type: 'A',
  })

  const record = listResp.result[0]

  if (!record) {
    throw new Error(`No record A found with name ${recordName}`)
  }

  const currentIp = await getPublicIP()

  if (record.content === currentIp) {
    return
  }

  cloudflare.dns.records.edit(record.id, {
    zone_id: zoneId,
    type: record.type,
    name: recordName,
    content: currentIp,
    ttl: record.ttl,
    proxied: record.proxied,
  })
}

export function dynDns() {
  for (const domain of DOMAINES_TO_UPDATE) {
    tryCatch(updateDnsRecord, domain)
  }
}
