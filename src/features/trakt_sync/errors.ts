import { Data } from 'effect'

export class TraktTokenExpiredError extends Data.TaggedError('TraktTokenExpiredError')<{ readonly message: string }> {
  constructor() {
    super({ message: '(Trakt) Token expired or missing' })
  }
}
