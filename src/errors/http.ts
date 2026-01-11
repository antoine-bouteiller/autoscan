import type { ArkErrors } from 'arktype'

import { BaseError } from './base'

export abstract class HttpError extends BaseError {
  abstract override readonly code: string
  abstract override readonly context: Record<string, unknown>
}

export class ApiError<E = unknown> extends HttpError {
  readonly code = 'api_error'
  readonly context: { body: E; status: number }
  private apiFormatter?: (body: E) => string

  constructor(status: number, body: E, apiFormatter?: (body: E) => string) {
    super()
    this.context = { body, status }
    this.apiFormatter = apiFormatter
    this.updateMessage()
  }

  format(): string {
    const { body, status } = this.context
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)

    return this.apiFormatter ? this.apiFormatter(body) : `API error (${status}): ${bodyStr}`
  }
}

export class NetworkError extends HttpError {
  readonly code = 'network_error'
  readonly context: { message: string }

  constructor(message: string) {
    super()
    this.context = { message }
    this.updateMessage()
  }

  format(): string {
    return `Network error: ${this.context.message}`
  }
}

export class ParseError extends HttpError {
  readonly code = 'parse_error'
  readonly context: { message: string }

  constructor(message: string) {
    super()
    this.context = { message }
    this.updateMessage()
  }

  format(): string {
    return `Parse error: ${this.context.message}`
  }
}

export class ValidationError extends HttpError {
  readonly code = 'validation_error'
  readonly context: { errors: ArkErrors }

  constructor(errors: ArkErrors) {
    super()
    this.context = { errors }
    this.updateMessage()
  }

  format(): string {
    return `Validation error: ${this.context.errors.summary}`
  }
}

export class HttpStatusError extends HttpError {
  readonly code = 'http_status_error'
  readonly context: { status: number; statusText: string }

  constructor(status: number, statusText: string) {
    super()
    this.context = { status, statusText }
    this.updateMessage()
  }

  format(): string {
    const { status, statusText } = this.context
    return `HTTP ${status}: ${statusText}`
  }
}
