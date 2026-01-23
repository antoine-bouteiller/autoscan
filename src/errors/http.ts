import { AppError } from './base'

export type HttpErrorFormatter = (body: unknown) => string

const defaultFormatter: HttpErrorFormatter = (body) => (typeof body === 'string' ? body : JSON.stringify(body))

export class HttpError extends AppError {
  constructor(
    public readonly serviceName: string,
    public readonly status: number,
    public readonly body: unknown,
    formatter: HttpErrorFormatter = defaultFormatter
  ) {
    super(`(${serviceName}) API error (${status}): ${formatter(body)}`)
  }
}
