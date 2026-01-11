import env from '@/config/env'
import { ApiError, IntegrationError } from '@/errors'
import { handleError } from '@/utils/error_handler'
import { httpClient } from '@/utils/http_client'

import {
  type DnsRecord,
  dnsRecordsResponseValidator,
  type ErrorResponse,
  errorValidator,
  ipifyResponseValidator,
  zonesResponseValidator,
} from './validators'

const ipifyClient = httpClient({
  baseUrl: 'https://api.ipify.org/',
})

const cloudflareClient = httpClient({
  baseUrl: 'https://api.cloudflare.com/client/v4/',
  errorValidator: errorValidator,
  headers: {
    Authorization: `Bearer ${env.CLOUDFLARE_TOKEN}`,
  },
})

const formatCloudflareError = (body: ErrorResponse) => body.errors.map((e) => e.message).join(', ')

const isCloudflareApiError = (error: unknown): error is ApiError<ErrorResponse> =>
  error instanceof ApiError &&
  typeof error.context.body === 'object' &&
  error.context.body !== null &&
  'errors' in error.context.body

export const getPublicIP = async () => {
  const result = await ipifyClient.get('', {
    params: { format: 'json' },
    validator: ipifyResponseValidator,
  })

  if (!result.ok) {
    throw new IntegrationError('Cloudflare', 'http_error', result.error)
  }

  return result.data.ip
}

export const getZoneId = async (zoneName: string): Promise<string> => {
  const result = await cloudflareClient.get('zones', {
    params: { name: zoneName },
    validator: zonesResponseValidator,
  })

  if (!result.ok) {
    const { error } = result
    if (isCloudflareApiError(error)) {
      const formattedMessage = formatCloudflareError(error.context.body)
      throw new IntegrationError('Cloudflare', 'http_error', formattedMessage)
    }
    throw new IntegrationError('Cloudflare', 'http_error', error)
  }

  const [zone] = result.data.result

  if (!zone) {
    throw new IntegrationError('Cloudflare', 'not_found', 'Zone not found')
  }

  return zone.id
}

export const getARecord = async (recordName: string, zoneId: string) => {
  const result = await cloudflareClient.get(`zones/${zoneId}/dns_records`, {
    params: { name: recordName, type: 'A' },
    validator: dnsRecordsResponseValidator,
  })

  if (!result.ok) {
    const { error } = result
    if (isCloudflareApiError(error)) {
      const formattedMessage = formatCloudflareError(error.context.body)
      handleError(new IntegrationError('Cloudflare', 'http_error', formattedMessage))
    } else {
      handleError(new IntegrationError('Cloudflare', 'http_error', error))
    }
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
    const { error } = result
    if (isCloudflareApiError(error)) {
      const formattedMessage = formatCloudflareError(error.context.body)
      handleError(new IntegrationError('Cloudflare', 'http_error', formattedMessage))
    } else {
      handleError(new IntegrationError('Cloudflare', 'http_error', error))
    }
  }
}
