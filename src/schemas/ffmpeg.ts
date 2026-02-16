import { Schema } from 'effect'

import { normalizeToIso1 } from '@/utils/iso_codes'

const LanguageTransform = Schema.transform(Schema.String, Schema.String, {
  decode: (s) => normalizeToIso1(s) ?? s,
  encode: (s) => s,
})

export const FfprobeStream = Schema.Struct({
  channels: Schema.optional(Schema.Number),
  codec_name: Schema.optional(Schema.String),
  codec_type: Schema.optional(Schema.String),
  index: Schema.optional(Schema.Number),
  sample_rate: Schema.optional(
    Schema.transform(Schema.String, Schema.Number, {
      decode: Number,
      encode: String,
    })
  ),
  tags: Schema.optional(
    Schema.Struct({
      language: Schema.optional(LanguageTransform),
      title: Schema.optional(Schema.String),
    })
  ),
})
export type FfprobeStream = typeof FfprobeStream.Type

export const FfprobeOutput = Schema.Struct({
  streams: Schema.Array(FfprobeStream),
})
export type FfprobeOutput = typeof FfprobeOutput.Type
