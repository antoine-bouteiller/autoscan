import * as v from 'valibot'

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
  const cloudflareError = v.safeParse(cloudflareErrorResponse, body)
  if (!cloudflareError.success) {
    return typeof body === 'string' ? body : JSON.stringify(body)
  }
  return cloudflareError.output.errors.map((error) => error.message).join(', ')
}
