import { ISO1, iso1ToIso2T, iso2ToIso1, iso2TToIso2B, type ISOCode1, type ISOCode2B } from '#/shared/types/iso_codes'

import { isInArray } from './array.js'
import { isKeyOf } from './object.js'

/**
 * Normalize a language code to ISO 639-1 (2-character) format
 * Accepts ISO 639-1, ISO 639-2/B, or ISO 639-2/T codes
 */
export const normalizeToIso1 = (code?: string): ISOCode1 | undefined => {
  if (!code) {
    return undefined
  }

  const lowerCode = code.toLowerCase()

  if (isInArray(ISO1, lowerCode)) {
    return lowerCode
  }

  if (isKeyOf(iso2ToIso1, lowerCode)) {
    return iso2ToIso1[lowerCode]
  }

  return undefined
}

/**
 * Convert ISO 639-1 to ISO 639-2/B (3-character bibliographic) format
 * If no bibliographic variant exists, returns the terminologic code
 * This is useful for setting ffmpeg metadata tags which prefer bibliographic codes
 */
export const iso1ToIso2B = (code: ISOCode1): ISOCode2B => {
  const terminologic = iso1ToIso2T[code]

  if (isKeyOf(iso2TToIso2B, terminologic)) {
    return iso2TToIso2B[terminologic]
  }

  return terminologic
}
