import { createTaggedError } from '#utils/error'

export class TraktTokenExpiredError extends createTaggedError({
  message: '(Trakt) Token expired or missing',
  name: 'TraktTokenExpiredError',
}) {}
