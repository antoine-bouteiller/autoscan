import { type ISOCode1 } from '#types/iso_codes'
import { type PlexMediaStream } from '#validators/plex.validator'

export interface UpdateLanguageParams {
  mediaTitle: string
  partsId: number
  preferredLanguage: ISOCode1
  streams: PlexMediaStream[]
}
