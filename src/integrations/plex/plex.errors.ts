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
