import { BaseError } from './base'

type DnsErrorCode = 'record_not_found'

export class DnsError extends BaseError {
  readonly code: DnsErrorCode
  readonly context: {
    recordType?: string
  }

  constructor(code: DnsErrorCode, details?: { recordType?: string }) {
    super()
    this.code = code
    this.context = { recordType: details?.recordType }
    this.updateMessage()
  }

  format(): string {
    const { recordType } = this.context

    if (this.code === 'record_not_found') {
      return `(DNS) No record ${recordType || 'A'} found`
    }

    return '(DNS) Unknown error'
  }
}
