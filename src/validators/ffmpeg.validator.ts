import { type } from 'arktype'

import { normalizeToIso1 } from '@/utils/iso_codes'

export const ffprobeOutputValidator = type({
  streams: type({
    'channels?': 'number',
    'codec_name?': 'string',
    'codec_type?': 'string',
    'index?': 'number',
    'sample_rate?': 'string.numeric.parse',
    'tags?': {
      'language?': type('string').pipe(normalizeToIso1),
      'title?': 'string',
    },
  }).array(),
})

export type FfprobeOutput = typeof ffprobeOutputValidator.infer

export type FFprobeStream = FfprobeOutput['streams'][number]
