import { type FFprobeStream } from '@/integrations/ffmpeg/ffmpeg.validator'
import { type ISOCode1 } from '@/shared/types/iso_codes'

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

const matchesTitleCriteria = (title: string, exclude: string[], include: string[]) =>
  (exclude.length === 0 || !exclude.some((term) => title.includes(term))) && (include.length === 0 || include.some((term) => title.includes(term)))

export const isStreamWanted = (criteria: Criteria) => (stream: FFprobeStream) => {
  if (criteria.language === 'und') {
    return stream.tags?.language === undefined
  }

  const { exclude = [], include = [], wantedEncodings = [] } = criteria
  const title = stream.tags?.title?.toLowerCase() ?? ''
  const codec = stream.codec_name?.toLowerCase() ?? ''

  return (
    stream.tags?.language === criteria.language &&
    matchesTitleCriteria(title, exclude, include) &&
    (wantedEncodings.length === 0 || wantedEncodings.includes(codec))
  )
}
