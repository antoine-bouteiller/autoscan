import type { PlexMediaStream } from '@/integrations/plex/validators'
import type { ISOCode1 } from '@/types/iso_codes'

export interface UpdateLanguageParams {
  mediaTitle: string
  partsId: number
  preferredLanguage: ISOCode1
  streams: PlexMediaStream[]
}
