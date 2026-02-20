import { createTaggedError } from '@/utils/error'

export class PlexError extends createTaggedError({
  name: 'PlexError',
  message: '(Plex) Not metadata found for media: $ratingKey',
}) {}
