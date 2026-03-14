import { createTaggedError } from '#utils/error'

export class TraktTokenExpiredError extends createTaggedError({
  name: 'TraktTokenExpiredError',
  message: '(Trakt) Token expired or missing',
}) {}
