import env from '#/config/env'
import { logger } from '#/config/logger'
import { container, TOKENS } from '#/core/container'
import { DnsRecordNotFoundError } from '#/features/dynamic_dns/errors'
import { isError, logError } from '#/shared/utils/error'

const DOMAINES_TO_UPDATE = [env.DOMAIN, `*.${env.DOMAIN}`]
const ZONE_NAME = env.DOMAIN

let zoneId = ''
let backoffUntil = 0
let errorDelay = 5 * 60 * 1000
const maxErrorDelay = 30 * 60 * 1000

export const handleUpdateIp = async (recordName: string) => {
  const cloudflareClient = container.resolve(TOKENS.CLOUDFLARE_CLIENT)

  if (!zoneId) {
    const zoneResult = await cloudflareClient.getZoneId(ZONE_NAME)
    if (isError(zoneResult)) {
      return zoneResult
    }
    zoneId = zoneResult
  }

  const data = await cloudflareClient.getARecord(recordName, zoneId)

  if (!data) {
    return undefined
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
    return undefined
  }

  await cloudflareClient.updateDnsRecord(record, currentIpResult, zoneId)
  return undefined
}

export const dynDns = async () => {
  if (Date.now() < backoffUntil) {
    logger.warn(`Skipping DNS update, backing off until ${new Date(backoffUntil).toISOString()}`, 'DynDNS')
    return
  }

  let hasError = false
  for (const recordName of DOMAINES_TO_UPDATE) {
    const result = await handleUpdateIp(recordName)
    if (isError(result)) {
      logError(result, 'handleUpdateIp')
      hasError = true
    }
  }

  if (hasError) {
    backoffUntil = Date.now() + errorDelay
    errorDelay = Math.min(errorDelay * 2, maxErrorDelay)
  } else {
    errorDelay = 5 * 60 * 1000
    backoffUntil = 0
  }
}

export const resetZoneIdCache = () => {
  zoneId = ''
  backoffUntil = 0
  errorDelay = 5 * 60 * 1000
}
