import { AppError } from './base'

export type HttpErrorFormatter = (body: unknown) => string

const defaultFormatter: HttpErrorFormatter = (body) => (typeof body === 'string' ? body : JSON.stringify(body))

export class HttpError extends AppError {
  public readonly status: number

  constructor(serviceName: string, status: number, body: unknown, formatter: HttpErrorFormatter = defaultFormatter) {
    super(`(${serviceName}) API error (${status}): ${formatter(body)}`, 502, 'UPSTREAM_ERROR')

    this.status = status
  }
}
