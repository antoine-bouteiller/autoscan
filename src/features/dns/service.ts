import env from '@/config/env'
import { DnsError } from '@/errors'
import { getARecord, getPublicIP, getZoneId, updateDnsRecord } from '@/integrations/cloudflare'
import { tryCatch } from '@/utils/error_handler'

const DOMAINES_TO_UPDATE = [env.DOMAIN, `*.${env.DOMAIN}`]
const ZONE_NAME = env.DOMAIN

let zoneId = ''

export const handleUpdateIp = async (recordName: string) => {
  if (!zoneId) {
    zoneId = await getZoneId(ZONE_NAME)
  }

  const data = await getARecord(recordName, zoneId)

  if (!data) {
    return
  }

  const [record] = data.result

  if (!record) {
    throw new DnsError('record_not_found', { recordType: 'A' })
  }

  const currentIp = await getPublicIP()

  if (record.content === currentIp) {
    return
  }

  await updateDnsRecord(record, currentIp, zoneId)
}

export const dynDns = async () => {
  for (const recordName of DOMAINES_TO_UPDATE) {
    await tryCatch(handleUpdateIp, recordName)
  }
}

export const resetZoneIdCache = () => {
  zoneId = ''
}
