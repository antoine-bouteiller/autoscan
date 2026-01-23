import { ArkErrors } from 'arktype'

import { AppError, type HttpErrorFormatter } from '@/errors'

import { cloudflareErrorResponse } from './validators'

export class CloudflareZoneNotFoundError extends AppError {
  constructor(public readonly zoneName: string) {
    super(`(Cloudflare) Zone not found: ${zoneName}`)
  }
}

export const cloudflareErrorFormatter: HttpErrorFormatter = (body) => {
  const cloudflareError = cloudflareErrorResponse(body)
  if (cloudflareError instanceof ArkErrors) {
    return typeof body === 'string' ? body : JSON.stringify(body)
  }
  return cloudflareError.errors.map((e) => e.message).join(', ')
}
