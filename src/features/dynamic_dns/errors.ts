import { cloudflareErrorResponse } from '#integrations/cloudflare/cloudflare.validator'
import { type HttpErrorFormatter } from '#shared/errors/http'
import { createTaggedError } from '#shared/utils/error'

export class CloudflareZoneNotFoundError extends createTaggedError({
  message: '(Cloudflare) Zone not found: $zoneName',
  name: 'CloudflareZoneNotFoundError',
}) {}

export class DnsRecordNotFoundError extends createTaggedError({
  message: '(Cloudflare) Record not found for domain $domain',
  name: 'DnsRecordNotFoundError',
}) {}

export const cloudflareErrorFormatter: HttpErrorFormatter = (body) => {
  const cloudflareError = cloudflareErrorResponse.safeParse(body)
  if (!cloudflareError.success) {
    return typeof body === 'string' ? body : JSON.stringify(body)
  }
  return cloudflareError.data.errors.map((error) => error.message).join(', ')
}
