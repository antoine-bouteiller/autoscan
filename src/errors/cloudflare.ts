import { type HttpErrorFormatter } from '#errors/http'
import { createTaggedError } from '#utils/error'
import { cloudflareErrorResponse } from '#validators/cloudflare.validator'

export class CloudflareZoneNotFoundError extends createTaggedError({
  name: 'CloudflareZoneNotFoundError',
  message: '(Cloudflare) Zone not found: $zoneName',
}) {}

export class DnsRecordNotFoundError extends createTaggedError({
  name: 'DnsRecordNotFoundError',
  message: '(Cloudflare) Record not found for domain $domain',
}) {}

export const cloudflareErrorFormatter: HttpErrorFormatter = (body) => {
  const cloudflareError = cloudflareErrorResponse.safeParse(body)
  if (!cloudflareError.success) {
    return typeof body === 'string' ? body : JSON.stringify(body)
  }
  return cloudflareError.data.errors.map((error) => error.message).join(', ')
}
