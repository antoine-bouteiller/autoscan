import { Schema } from 'effect'

export class PlexError extends Schema.TaggedError<PlexError, { readonly brand: unique symbol }>()('PlexError', {
  cause: Schema.optional(Schema.Unknown),
  ratingKey: Schema.Finite,
}) {
  override get message() {
    return `(Plex) Not metadata found for media: ${this.ratingKey}`
  }
}

export class PlexUnauthenticatedError extends Schema.TaggedError<PlexUnauthenticatedError, { readonly brand: unique symbol }>()(
  'PlexUnauthenticatedError',
  {}
) {
  override get message() {
    return '(Plex) Token missing or rejected, run /plex to link the account'
  }
}
