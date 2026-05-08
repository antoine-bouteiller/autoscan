import { z } from 'zod'

import { type ISOCode1 } from '#/shared/types/iso_codes'
import { normalizeToIso1 } from '#/shared/utils/iso_codes'

export const ffprobeOutputValidator = z.object({
  format: z.object({
    duration: z.coerce.number(),
  }),
  streams: z.array(
    z.object({
      channels: z.number().optional(),
      codec_name: z.string().optional(),
      codec_type: z.string().optional(),
      index: z.number().optional(),
      sample_rate: z.union([z.number(), z.coerce.number()]).optional(),
      tags: z
        .object({
          language: z
            .string()
            .transform((value: string): ISOCode1 | undefined => normalizeToIso1(value))
            .optional(),
          title: z.string().optional(),
        })
        .optional(),
    })
  ),
})

type FfprobeOutput = z.infer<typeof ffprobeOutputValidator>

export type FFprobeStream = FfprobeOutput['streams'][number]
