import { type PlexMediaStream } from '@/integrations/plex/plex.validator'
import { type TwoLetterLanguageCode } from '@/shared/types/iso_codes'

export interface UpdateLanguageParams {
  mediaTitle: string
  partsId: number
  preferredLanguage: TwoLetterLanguageCode
  streams: PlexMediaStream[]
}
