import { Schema, SchemaGetter } from 'effect'

import { ISO1 } from '@/shared/types/iso_codes'
import { normalizeToIso1 } from '@/shared/utils/iso_codes'
import { NumberFromUnknown } from '@/shared/utils/schema'

const languageValidator = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.Literals(ISO1)), {
    decode: SchemaGetter.transform(normalizeToIso1),
    encode: SchemaGetter.transform((value) => value ?? ''),
  })
)

export const ffprobeOutputValidator = Schema.Struct({
  format: Schema.Struct({
    duration: NumberFromUnknown,
  }),
  streams: Schema.Array(
    Schema.Struct({
      channels: Schema.optional(Schema.Finite),
      codec_name: Schema.optional(Schema.String),
      codec_type: Schema.optional(Schema.String),
      index: Schema.optional(Schema.Finite),
      sample_rate: Schema.optional(NumberFromUnknown),
      tags: Schema.optional(
        Schema.Struct({
          language: Schema.optional(languageValidator),
          title: Schema.optional(Schema.String),
        })
      ),
    })
  ).pipe(Schema.mutable),
})

type FfprobeOutput = typeof ffprobeOutputValidator.Type

export type FFprobeStream = FfprobeOutput['streams'][number]
