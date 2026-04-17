import { type PlexMediaStream } from '#integrations/plex/plex.validator'
import { type ISOCode1 } from '#shared/types/iso_codes'

export interface UpdateLanguageParams {
  mediaTitle: string
  partsId: number
  preferredLanguage: ISOCode1
  streams: PlexMediaStream[]
}
