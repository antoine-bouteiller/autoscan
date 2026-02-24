import * as v from 'valibot'

import { ISO2T } from '@/types/iso_codes'

const integerFromString = v.pipe(
  v.string(),
  v.transform((value) => Number(value)),
  v.check((value) => Number.isInteger(value), 'Expected integer string')
)

const streamValidator = v.object({
  id: v.number(),
  languageCode: v.optional(v.picklist(ISO2T)),
  selected: v.optional(v.boolean()),
  streamType: v.union([v.literal(1), v.literal(2), v.literal(3)]),
  title: v.optional(v.string()),
})

const plexMediaValidator = v.object({
  grandparentTitle: v.optional(v.string()),
  index: v.optional(v.number()),
  key: v.string(),
  lastViewedAt: v.optional(v.number()),
  librarySectionID: v.optional(v.number()),
  Media: v.array(
    v.object({
      Part: v.array(
        v.object({
          file: v.string(),
          id: v.number(),
          Stream: v.optional(v.array(streamValidator)),
        })
      ),
    })
  ),
  parentIndex: v.optional(v.number()),
  parentTitle: v.optional(v.string()),
  primaryExtraKey: v.optional(v.string()),
  ratingKey: v.string(),
  title: v.string(),
  type: v.union([v.literal('episode'), v.literal('movie')]),
  viewCount: v.optional(v.number()),
  year: v.number(),
})

const plexDirectoryValidator = v.object({
  key: v.union([integerFromString, v.number()]),
  title: v.string(),
  type: v.union([v.literal('movie'), v.literal('show')]),
})

export const plexResponseValidator = v.object({
  MediaContainer: v.object({
    Directory: v.optional(v.array(plexDirectoryValidator)),
    Metadata: v.optional(v.array(plexMediaValidator)),
  }),
})

export type PlexMediaStream = v.InferOutput<typeof streamValidator>
export type PlexMedia = v.InferOutput<typeof plexMediaValidator>
