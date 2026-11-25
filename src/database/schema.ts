import { type TwoLetterLanguageCode } from '@/shared/types/iso_codes'

const MEDIA_TYPES = ['movie', 'show'] as const
const SUBTITLE_VERDICTS = ['passed', 'sync_requested', 'invalid', 'inconclusive'] as const
const SUBTITLE_EVIDENCES = ['audio', 'reference'] as const
const BAZARR_KINDS = ['movie', 'episode'] as const

type MediaType = (typeof MEDIA_TYPES)[number]
type SubtitleVerdict = (typeof SUBTITLE_VERDICTS)[number]
type SubtitleEvidence = (typeof SUBTITLE_EVIDENCES)[number]
type BazarrKind = (typeof BAZARR_KINDS)[number]

export interface Media {
  originalLanguage: TwoLetterLanguageCode
  preferredLanguage: TwoLetterLanguageCode
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
  evidence: SubtitleEvidence | null
  fileSize: number | null
  fileMtime: Date | null
}

export interface TranscodeScan {
  filePath: string
  originalLanguage: TwoLetterLanguageCode
  scanVersion: number
  scannedAt: Date
}

export interface MissingSubtitle {
  actedAt: Date | null
  bazarrId: number
  bazarrKind: BazarrKind
  firstSeenAt: Date
  language: TwoLetterLanguageCode
}

export interface FrenchProfile {
  assignedAt: Date
  bazarrId: number
  bazarrKind: BazarrKind
  releasedAt: Date | null
}
