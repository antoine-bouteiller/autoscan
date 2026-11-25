import { describe, expect, test } from 'bun:test'

import { iso1ToIso2B, normalizeToTwoLetterCode } from '@/shared/utils/iso_codes'

describe('ISO codes', () => {
  describe('normalizeToTwoLetterCode', () => {
    test('should convert fre (bibliographic) to fr (ISO 639-1)', () => {
      expect(normalizeToTwoLetterCode('fre')).toBe('fr')
    })

    test('should convert fra (terminologic) to fr (ISO 639-1)', () => {
      expect(normalizeToTwoLetterCode('fra')).toBe('fr')
    })

    test('should convert 3-character codes to 2-character codes', () => {
      expect(normalizeToTwoLetterCode('eng')).toBe('en')
      expect(normalizeToTwoLetterCode('spa')).toBe('es')
      expect(normalizeToTwoLetterCode('deu')).toBe('de')
    })

    test('should handle 2-character codes directly', () => {
      expect(normalizeToTwoLetterCode('en')).toBe('en')
      expect(normalizeToTwoLetterCode('fr')).toBe('fr')
      expect(normalizeToTwoLetterCode('es')).toBe('es')
    })
  })

  describe('iso1ToIso2B', () => {
    test('should convert fr (ISO 639-1) to fre (bibliographic)', () => {
      expect(iso1ToIso2B('fr')).toBe('fre')
    })

    test('should convert en (ISO 639-1) to eng  (bibliographic)', () => {
      expect(iso1ToIso2B('en')).toBe('eng')
    })
  })
})
