import * as v from 'valibot'

import { AppError } from '@/errors/base'
import { type HttpErrorFormatter } from '@/errors/http'
import { cloudflareErrorResponse } from '@/validators/cloudflare.validator'

export class CloudflareZoneNotFoundError extends AppError {
  constructor(zoneName: string) {
    super(`(Cloudflare) Zone not found: ${zoneName}`)
  }
}

export const cloudflareErrorFormatter: HttpErrorFormatter = (body) => {
  const cloudflareError = v.safeParse(cloudflareErrorResponse, body)
  if (!cloudflareError.success) {
    return typeof body === 'string' ? body : JSON.stringify(body)
  }
  return cloudflareError.output.errors.map((error) => error.message).join(', ')
}
