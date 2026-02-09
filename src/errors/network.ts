import { AppError } from './base'

export class NetworkError extends AppError {
  constructor(
    public readonly serviceName: string,
    public readonly originalMessage: string
  ) {
    super(`(${serviceName}) Network Error: ${originalMessage}`, 503, 'SERVICE_UNAVAILABLE')
  }
}
