import type { FfprobeStream } from '@/schemas/ffmpeg'

import { type ISOCode1 } from '@/types/iso_codes'

export type Criteria =
  | {
      exclude?: string[]
      language: ISOCode1
      wantedEncodings?: string[]
    }
  | {
      language: 'und'
      wantedEncodings?: string[]
    }

export const isStreamWanted = (criteria: Criteria) => (stream: FfprobeStream) => {
  if (criteria.language === 'und') {
    return stream.tags?.language === undefined
  }

  return (
    stream.tags?.language === criteria.language &&
    (!criteria.exclude?.length || !criteria.exclude.some((term) => stream.tags?.title?.toLowerCase().includes(term))) &&
    (!criteria.wantedEncodings?.length || (stream.codec_name && criteria.wantedEncodings.includes(stream.codec_name.toLowerCase())))
  )
}

export const simpleHash = (str: string) => {
  let hash = 0
  let index = 0
  let char = str.codePointAt(index)

  while (char !== undefined) {
    hash = (hash << 5) - hash + char
    hash &= hash
    char = str.codePointAt(index++)
  }
  return hash
}
