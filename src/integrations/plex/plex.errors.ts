import { createTaggedError } from '#/shared/utils/error'

export class PlexError extends createTaggedError({
  message: '(Plex) Not metadata found for media: $ratingKey',
  name: 'PlexError',
}) {}
