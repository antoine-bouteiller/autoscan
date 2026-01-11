export abstract class BaseError extends Error {
  abstract readonly code: string
  abstract readonly context: Record<string, unknown>

  abstract format(): string

  constructor() {
    super('')
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  protected updateMessage(): void {
    Object.defineProperty(this, 'message', {
      configurable: true,
      enumerable: false,
      value: this.format(),
      writable: true,
    })
  }
}
