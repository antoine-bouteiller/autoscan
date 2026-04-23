import { describe, expect, test } from 'vite-plus/test'

import { iso1ToIso2B, normalizeToIso1 } from '#/shared/utils/iso_codes'

describe('ISO codes', () => {
  describe('normalizeToIso1', () => {
    test('should convert fre (bibliographic) to fr (ISO 639-1)', () => {
      expect(normalizeToIso1('fre')).toBe('fr')
    })

    test('should convert fra (terminologic) to fr (ISO 639-1)', () => {
      expect(normalizeToIso1('fra')).toBe('fr')
    })

    test('should convert 3-character codes to 2-character codes', () => {
      expect(normalizeToIso1('eng')).toBe('en')
      expect(normalizeToIso1('spa')).toBe('es')
      expect(normalizeToIso1('deu')).toBe('de')
    })

    test('should handle 2-character codes directly', () => {
      expect(normalizeToIso1('en')).toBe('en')
      expect(normalizeToIso1('fr')).toBe('fr')
      expect(normalizeToIso1('es')).toBe('es')
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
