import { z } from 'zod'

import { ISO2T } from '#shared/types/iso_codes'

const streamValidator = z.object({
  id: z.number(),
  languageCode: z.enum(ISO2T).optional(),
  selected: z.boolean().optional(),
  streamType: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().optional(),
})

const plexMediaValidator = z.object({
  Media: z.array(
    z.object({
      Part: z.array(
        z.object({
          Stream: z
            .array(z.unknown())
            .transform((items) =>
              items.flatMap((item) => {
                const result = streamValidator.safeParse(item)
                return result.success ? [result.data] : []
              })
            )
            .optional(),
          file: z.string(),
          id: z.number(),
        })
      ),
    })
  ),
  grandparentTitle: z.string().optional(),
  index: z.number().optional(),
  key: z.string(),
  lastViewedAt: z.number().optional(),
  librarySectionID: z.number().optional(),
  parentIndex: z.number().optional(),
  parentTitle: z.string().optional(),
  primaryExtraKey: z.string().optional(),
  ratingKey: z.string(),
  title: z.string(),
  type: z.union([z.literal('episode'), z.literal('movie')]),
  viewCount: z.number().optional(),
  year: z.number(),
})

const plexDirectoryValidator = z.object({
  key: z.coerce.number(),
  title: z.string(),
  type: z.union([z.literal('movie'), z.literal('show')]),
})

export const plexResponseValidator = z.object({
  MediaContainer: z.object({
    Directory: z.array(plexDirectoryValidator).optional(),
    Metadata: z.array(plexMediaValidator).optional(),
  }),
})

export type PlexMediaStream = z.infer<typeof streamValidator>
export type PlexMedia = z.infer<typeof plexMediaValidator>
