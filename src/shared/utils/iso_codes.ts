import { Array } from 'effect'

import {
  TWO_LETTER_LANGUAGE_CODES,
  iso1ToIso2T,
  threeLetterToTwoLetterCode,
  iso2TToIso2B,
  type TwoLetterLanguageCode,
  type ISOCode2B,
  type ISOCode2T,
} from '@/shared/types/iso_codes'

const isIso1Code = (code: string): code is TwoLetterLanguageCode => Array.contains(TWO_LETTER_LANGUAGE_CODES, code)
const isIso2Code = (code: string): code is keyof typeof threeLetterToTwoLetterCode => code in threeLetterToTwoLetterCode
const hasBibliographicCode = (code: ISOCode2T): code is keyof typeof iso2TToIso2B => code in iso2TToIso2B

/**
 * Normalize a language code to ISO 639-1 (2-character) format
 * Accepts ISO 639-1, ISO 639-2/B, or ISO 639-2/T codes
 */
export const normalizeToTwoLetterCode = (code?: string): TwoLetterLanguageCode | undefined => {
  if (code === undefined) {
    return undefined
  }

  const lowerCode = code.toLowerCase()

  if (isIso1Code(lowerCode)) {
    return lowerCode
  }

  return isIso2Code(lowerCode) ? threeLetterToTwoLetterCode[lowerCode] : undefined
}

/**
 * Convert ISO 639-1 to ISO 639-2/B (3-character bibliographic) format
 * If no bibliographic variant exists, returns the terminologic code
 * This is useful for setting ffmpeg metadata tags which prefer bibliographic codes
 */
export const iso1ToIso2B = (code: TwoLetterLanguageCode): ISOCode2B => {
  const terminologic = iso1ToIso2T[code]

  return hasBibliographicCode(terminologic) ? iso2TToIso2B[terminologic] : terminologic
}
