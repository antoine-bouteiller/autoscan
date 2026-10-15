import { type ISOCode1 } from '@/shared/types/iso_codes'

const MEDIA_TYPES = ['movie', 'show'] as const
const SUBTITLE_VERDICTS = ['passed', 'forced_removed', 'sync_requested', 'invalid'] as const
const BAZARR_KINDS = ['movie', 'episode'] as const

type MediaType = (typeof MEDIA_TYPES)[number]
type SubtitleVerdict = (typeof SUBTITLE_VERDICTS)[number]
type BazarrKind = (typeof BAZARR_KINDS)[number]

export interface Media {
  originalLanguage: ISOCode1
  preferredLanguage: ISOCode1
  title: string
  tmdbId: number
  type: MediaType
}

export interface PlexToken {
  authToken: string
  clientIdentifier: string
  id: number
  linkedAt: Date
}

export interface SubtitleScan {
  filePath: string
  scanVersion: number
  scannedAt: Date
  verdict: SubtitleVerdict
}

export interface TranscodeScan {
  filePath: string
  originalLanguage: ISOCode1
  scanVersion: number
  scannedAt: Date
}

export interface MissingSubtitle {
  actedAt: Date | null
  bazarrId: number
  bazarrKind: BazarrKind
  firstSeenAt: Date
  language: ISOCode1
}

export interface FrenchProfile {
  assignedAt: Date
  bazarrId: number
  bazarrKind: BazarrKind
  releasedAt: Date | null
}
