import * as v from 'valibot'

import type { ISOCode1 } from '#types/iso_codes'
import { normalizeToIso1 } from '#utils/iso_codes'

export const ffprobeOutputValidator = v.object({
  streams: v.array(
    v.object({
      channels: v.optional(v.number()),
      codec_name: v.optional(v.string()),
      codec_type: v.optional(v.string()),
      index: v.optional(v.number()),
      sample_rate: v.optional(v.union([v.number(), v.pipe(v.string(), v.toNumber())])),
      tags: v.optional(
        v.object({
          language: v.optional(
            v.pipe(
              v.string(),
              v.transform((value: string): ISOCode1 | undefined => normalizeToIso1(value))
            )
          ),
          title: v.optional(v.string()),
        })
      ),
    })
  ),
})

export type FfprobeOutput = v.InferOutput<typeof ffprobeOutputValidator>

export type FFprobeStream = FfprobeOutput['streams'][number]
