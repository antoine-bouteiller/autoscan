import type { FFprobeStream } from '@/app/validators/ffprobe_validator'
import type { iso2 } from '@/types/iso_codes'

export type Criteria =
  | {
      exclude?: string[]
      language: iso2
      wantedEncodings?: string[]
    }
  | {
      language: 'und'
      wantedEncodings?: string[]
    }

export const isStreamWanted = (criteria: Criteria) => (stream: FFprobeStream) => {
  if (criteria.language === 'und') {
    return stream.tags?.language === undefined || stream.tags.language.toLowerCase() === 'und'
  }
  return (
    stream.tags?.language?.toLowerCase() === criteria.language &&
    (!criteria.exclude?.length ||
      !criteria.exclude.some((term) => stream.tags?.title?.toLowerCase().includes(term))) &&
    (!criteria.wantedEncodings?.length ||
      (stream.codec_name && criteria.wantedEncodings.includes(stream.codec_name.toLowerCase())))
  )
}
