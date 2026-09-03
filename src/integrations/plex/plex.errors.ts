import { Data } from 'effect'

interface PlexErrorFields {
  readonly cause?: unknown
  readonly ratingKey: number
}

export class PlexError extends Data.TaggedError('PlexError')<PlexErrorFields & { readonly message: string }> {
  constructor(fields: PlexErrorFields) {
    super({ ...fields, message: `(Plex) Not metadata found for media: ${fields.ratingKey}` })
  }
}

export class PlexUnauthenticatedError extends Data.TaggedError('PlexUnauthenticatedError')<{ readonly message: string }> {
  constructor() {
    super({ message: '(Plex) Token missing or rejected, run /plex to link the account' })
  }
}
