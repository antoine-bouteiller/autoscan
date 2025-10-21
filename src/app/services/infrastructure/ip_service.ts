import { tryCatch } from '@/app/exceptions/handler'
import env from '@/config/env'
import Cloudflare from 'cloudflare'
import ky from 'ky'

interface IpifyResponse {
  ip: string
}

let zoneId = ''

const DOMAINES_TO_UPDATE = [env.DOMAIN, `*.${env.DOMAIN}`]
const ZONE_NAME = env.DOMAIN

const cloudflare = new Cloudflare({
  apiToken: env.CLOUDFLARE_TOKEN,
})

const getPublicIP = async () => {
  const data = await ky<IpifyResponse>('https://api.ipify.org?format=json').json()

  return data.ip
}

const getZoneId = async (): Promise<string> => {
  if (zoneId) {
    return zoneId
  }

  const zonesResp = await cloudflare.zones.list({
    name: ZONE_NAME,
  })

  const [zone] = zonesResp.result

  if (!zone) {
    throw new Error(`Zone not found`)
  }

  zoneId = zone.id
  return zone.id
}

const updateDnsRecord = async (recordName: string) => {
  const currentZoneId = await getZoneId()

  const listResp = await cloudflare.dns.records.list({
    name: { exact: recordName },
    type: 'A',
    zone_id: currentZoneId,
  })

  const [record] = listResp.result

  if (!record) {
    throw new Error(`No record A found with name ${recordName}`)
  }

  const currentIp = await getPublicIP()

  if (record.content === currentIp) {
    return
  }

  await cloudflare.dns.records.edit(record.id, {
    content: currentIp,
    name: recordName,
    proxied: record.proxied,
    ttl: record.ttl,
    type: record.type,
    zone_id: currentZoneId,
  })
}

export const dynDns = () => {
  for (const domain of DOMAINES_TO_UPDATE) {
    tryCatch(updateDnsRecord, domain)
  }
}
