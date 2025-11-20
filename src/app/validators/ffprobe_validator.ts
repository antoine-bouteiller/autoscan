import { ISO1 } from '@/types/iso_codes'
import { normalizeToIso1 } from '@/utils/iso_codes'
import { z } from 'zod'

export const ffprobeOutputValidator = z.object({
  streams: z.array(
    z.object({
      channels: z.number().optional(),
      codec_name: z.string().optional(),
      codec_type: z.string().optional(),
      index: z.coerce.number().optional(),
      sample_rate: z.coerce.number().optional(),
      tags: z
        .object({
          language: z.string().optional().transform(normalizeToIso1).pipe(z.enum(ISO1).optional()),
          title: z.string().optional(),
        })
        .optional(),
    })
  ),
})

export type FfprobeOutput = z.infer<typeof ffprobeOutputValidator>

export type FFprobeStream = FfprobeOutput['streams'][number]
