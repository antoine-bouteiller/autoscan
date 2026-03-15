import env from '#config/env'
import { container, TOKENS } from '#core/container'
import { DnsRecordNotFoundError } from '#errors/cloudflare'
import type { ICloudflareClient } from '#integrations/cloudflare.service'
import { isError, logError } from '#utils/error'

const DOMAINES_TO_UPDATE = [env.DOMAIN, `*.${env.DOMAIN}`]
const ZONE_NAME = env.DOMAIN

let zoneId = ''

export const handleUpdateIp = async (recordName: string) => {
  const cloudflareClient = container.resolve<ICloudflareClient>(TOKENS.CLOUDFLARE_CLIENT)

  if (!zoneId) {
    const zoneResult = await cloudflareClient.getZoneId(ZONE_NAME)
    if (isError(zoneResult)) {
      return zoneResult
    }
    zoneId = zoneResult
  }

  const data = await cloudflareClient.getARecord(recordName, zoneId)

  if (!data) {
    return
  }

  const [record] = data.result

  if (!record) {
    return new DnsRecordNotFoundError({ domain: recordName })
  }

  const currentIpResult = await cloudflareClient.getPublicIP()
  if (isError(currentIpResult)) {
    return currentIpResult
  }

  if (record.content === currentIpResult) {
    return
  }

  await cloudflareClient.updateDnsRecord(record, currentIpResult, zoneId)
}

export const dynDns = async () => {
  for (const recordName of DOMAINES_TO_UPDATE) {
    const result = await handleUpdateIp(recordName)
    if (isError(result)) {
      logError(result, 'handleUpdateIp')
    }
  }
}

export const resetZoneIdCache = () => {
  zoneId = ''
}
