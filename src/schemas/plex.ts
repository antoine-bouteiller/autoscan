import { Schema } from 'effect'

import { ISO2T } from '@/types/iso_codes'

export const PlexMediaStream = Schema.Struct({
  id: Schema.Number,
  languageCode: Schema.optional(Schema.Literal(...ISO2T)),
  selected: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  streamType: Schema.Union(Schema.Literal(1), Schema.Literal(2), Schema.Literal(3)),
  title: Schema.optional(Schema.String),
})
export type PlexMediaStream = typeof PlexMediaStream.Type

export const PlexMedia = Schema.Struct({
  grandparentTitle: Schema.optional(Schema.String),
  key: Schema.String,
  librarySectionID: Schema.optional(Schema.Number),
  Media: Schema.Array(
    Schema.Struct({
      Part: Schema.Array(
        Schema.Struct({
          file: Schema.String,
          id: Schema.Number,
          Stream: Schema.optional(Schema.Array(PlexMediaStream)),
        })
      ),
    })
  ),
  parentTitle: Schema.optional(Schema.String),
  primaryExtraKey: Schema.optional(Schema.String),
  ratingKey: Schema.String,
  title: Schema.String,
  type: Schema.Union(Schema.Literal('episode'), Schema.Literal('movie')),
  year: Schema.Number,
})
export type PlexMedia = typeof PlexMedia.Type

export const mediaType = ['movie', 'show'] as const

export const MediaType = Schema.Union(Schema.Literal(...mediaType))
export type MediaType = typeof MediaType.Type

const PlexDirectory = Schema.Struct({
  key: Schema.transform(Schema.String, Schema.Number, {
    decode: Number,
    encode: String,
  }),
  title: Schema.String,
  type: MediaType,
})

export const PlexResponse = Schema.Struct({
  MediaContainer: Schema.Struct({
    Directory: Schema.optional(Schema.Array(PlexDirectory)),
    Metadata: Schema.optional(Schema.Array(PlexMedia)),
  }),
})
export type PlexResponse = typeof PlexResponse.Type
