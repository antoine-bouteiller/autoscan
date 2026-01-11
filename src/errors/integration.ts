import { BaseError } from './base'
import type { HttpError } from './http'

type IntegrationErrorCode = 'http_error' | 'invalid_response' | 'not_found'

type ServiceName = 'Cloudflare' | 'Plex' | 'Radarr' | 'Sonarr' | 'TMDB'

export class IntegrationError extends BaseError {
  readonly code: IntegrationErrorCode
  readonly context: {
    details?: HttpError | string
    service: ServiceName
  }

  constructor(service: ServiceName, code: IntegrationErrorCode, details?: HttpError | string) {
    super()
    this.code = code
    this.context = { details, service }
    this.updateMessage()
  }

  format(): string {
    const { details, service } = this.context

    if (this.code === 'http_error' && details && typeof details === 'object') {
      return `(${service}) ${details.format()}`
    }

    if (typeof details === 'string') {
      return `(${service}) ${details}`
    }

    return `(${service}) ${this.code.replace(/_/g, ' ')}`
  }
}
