import { type ISOCode1 } from '#types/iso_codes'
import { type FFprobeStream } from '#validators/ffmpeg.validator'

export type Criteria =
  | {
      exclude?: string[]
      include?: string[]
      language: ISOCode1
      wantedEncodings?: string[]
    }
  | {
      language: 'und'
      wantedEncodings?: string[]
    }

export const isStreamWanted = (criteria: Criteria) => (stream: FFprobeStream) => {
  if (criteria.language === 'und') {
    return stream.tags?.language === undefined
  }

  return (
    stream.tags?.language === criteria.language &&
    (!criteria.exclude?.length || !criteria.exclude.some((term) => stream.tags?.title?.toLowerCase().includes(term))) &&
    (!criteria.include?.length || criteria.include.some((term) => stream.tags?.title?.toLowerCase().includes(term))) &&
    (!criteria.wantedEncodings?.length || (stream.codec_name && criteria.wantedEncodings.includes(stream.codec_name.toLowerCase())))
  )
}
