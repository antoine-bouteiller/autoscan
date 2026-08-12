import { Array } from 'effect'

import { ISO1, iso1ToIso2T, iso2ToIso1, iso2TToIso2B, type ISOCode1, type ISOCode2B, type ISOCode2T } from '@/shared/types/iso_codes'

const isIso1Code = (code: string): code is ISOCode1 => Array.contains(ISO1, code)
const isIso2Code = (code: string): code is keyof typeof iso2ToIso1 => code in iso2ToIso1
const hasBibliographicCode = (code: ISOCode2T): code is keyof typeof iso2TToIso2B => code in iso2TToIso2B

/**
 * Normalize a language code to ISO 639-1 (2-character) format
 * Accepts ISO 639-1, ISO 639-2/B, or ISO 639-2/T codes
 */
export const normalizeToIso1 = (code?: string): ISOCode1 | undefined => {
  if (code === undefined) {
    return undefined
  }

  const lowerCode = code.toLowerCase()

  if (isIso1Code(lowerCode)) {
    return lowerCode
  }

  return isIso2Code(lowerCode) ? iso2ToIso1[lowerCode] : undefined
}

/**
 * Convert ISO 639-1 to ISO 639-2/B (3-character bibliographic) format
 * If no bibliographic variant exists, returns the terminologic code
 * This is useful for setting ffmpeg metadata tags which prefer bibliographic codes
 */
export const iso1ToIso2B = (code: ISOCode1): ISOCode2B => {
  const terminologic = iso1ToIso2T[code]

  return hasBibliographicCode(terminologic) ? iso2TToIso2B[terminologic] : terminologic
}
