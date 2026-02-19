import { AppError } from './base'

export class NetworkError extends AppError {
  public readonly originalMessage: string

  constructor(serviceName: string, originalMessage: string) {
    super(`(${serviceName}) Network Error: ${originalMessage}`, 503, 'SERVICE_UNAVAILABLE')
    this.originalMessage = originalMessage
  }
}
