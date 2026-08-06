import { Result, Schema, SchemaGetter } from 'effect'

import { ISO2T } from '@/shared/types/iso_codes'
import { NumberFromUnknown } from '@/shared/utils/schema'

const streamValidator = Schema.Struct({
  id: Schema.Finite,
  languageCode: Schema.optional(Schema.Literals(ISO2T)),
  selected: Schema.optional(Schema.Boolean),
  streamType: Schema.Literals([1, 2, 3]),
  title: Schema.optional(Schema.String),
})

const decodeStream = Schema.decodeUnknownResult(streamValidator)
const streamsValidator = Schema.Array(Schema.Unknown).pipe(
  Schema.decodeTo(Schema.Array(streamValidator).pipe(Schema.mutable), {
    decode: SchemaGetter.transform((items) =>
      items.flatMap((item) => {
        const result = decodeStream(item)
        return Result.isSuccess(result) ? [result.success] : []
      })
    ),
    encode: SchemaGetter.transform((items) => items),
  })
)

const plexMediaValidator = Schema.Struct({
  Media: Schema.Array(
    Schema.Struct({
      Part: Schema.Array(
        Schema.Struct({
          Stream: Schema.optional(streamsValidator),
          file: Schema.String,
          id: Schema.Finite,
        })
      ).pipe(Schema.mutable),
    })
  ).pipe(Schema.mutable),
  grandparentTitle: Schema.optional(Schema.String),
  index: Schema.optional(Schema.Finite),
  key: Schema.String,
  lastViewedAt: Schema.optional(Schema.Finite),
  librarySectionID: Schema.optional(Schema.Finite),
  parentIndex: Schema.optional(Schema.Finite),
  parentTitle: Schema.optional(Schema.String),
  primaryExtraKey: Schema.optional(Schema.String),
  ratingKey: Schema.String,
  title: Schema.String,
  type: Schema.Literals(['episode', 'movie']),
  viewCount: Schema.optional(Schema.Finite),
  year: Schema.Finite,
})

const plexDirectoryValidator = Schema.Struct({
  key: NumberFromUnknown,
  title: Schema.String,
  type: Schema.Literals(['movie', 'show']),
})

export const plexResponseValidator = Schema.Struct({
  MediaContainer: Schema.Struct({
    Directory: Schema.optional(Schema.Array(plexDirectoryValidator).pipe(Schema.mutable)),
    Metadata: Schema.optional(Schema.Array(plexMediaValidator).pipe(Schema.mutable)),
  }),
})

export type PlexMediaStream = typeof streamValidator.Type
export type PlexMedia = typeof plexMediaValidator.Type
