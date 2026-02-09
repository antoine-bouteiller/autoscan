import type { CloudflareClient } from '@/integrations/cloudflare.service'

import env from '@/config/env'
import { container, TOKENS } from '@/core/container'
import { tryCatch } from '@/utils/error_handler'

const DOMAINES_TO_UPDATE = [env.DOMAIN, `*.${env.DOMAIN}`]
const ZONE_NAME = env.DOMAIN

let zoneId = ''

export const handleUpdateIp = async (recordName: string) => {
  const cloudflareClient = container.resolve<CloudflareClient>(TOKENS.CLOUDFLARE_CLIENT)

  if (!zoneId) {
    zoneId = await cloudflareClient.getZoneId(ZONE_NAME)
  }

  const data = await cloudflareClient.getARecord(recordName, zoneId)

  if (!data) {
    return
  }

  const [record] = data.result

  if (!record) {
    throw new Error('(Cloudflare) Record not found for domain')
  }

  const currentIp = await cloudflareClient.getPublicIP()

  if (record.content === currentIp) {
    return
  }

  await cloudflareClient.updateDnsRecord(record, currentIp, zoneId)
}

export const dynDns = async () => {
  for (const recordName of DOMAINES_TO_UPDATE) {
    await tryCatch(handleUpdateIp, recordName)
  }
}

export const resetZoneIdCache = () => {
  zoneId = ''
}
