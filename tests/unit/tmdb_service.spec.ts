import { getLanguageByIdAndType } from '@/app/services/integrations/tmdb_service'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock ky
const mockKyGet = mock()
const mockKyInstance = {
  get: mockKyGet,
}

mock.module('ky', () => ({
  default: {
    create: () => mockKyInstance,
  },
}))

// Mock media_service
const mockCreatedOrUpdatedMedia = mock()
mock.module('@/app/services/media/media_service', () => ({
  createdOrUpdatedMedia: mockCreatedOrUpdatedMedia,
}))

// Mock env
mock.module('@/config/env', () => ({
  default: {
    TMDB_API_TOKEN: 'test-token',
    TMDB_API_URL: 'https://api.themoviedb.org/3',
  },
}))

// Mock countryISOMapping
mock.module('@/types/iso_codes', () => ({
  countryISOMapping: {
    en: 'eng',
    es: 'spa',
    fr: 'fre',
  },
}))

describe('TmdbService', () => {
  beforeEach(() => {
    mockKyGet.mockReset()
    mockCreatedOrUpdatedMedia.mockReset()
  })

  describe('getLanguageByIdAndType - movie', () => {
    test('should return language for valid movie', async () => {
      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue({
          original_language: 'fr',
          title: 'Test Movie',
        }),
        ok: true,
      })

      const result = await getLanguageByIdAndType(123, 'movie')

      expect(result).toBe('fre')
      expect(mockCreatedOrUpdatedMedia).toHaveBeenCalledWith(123, 'movie', 'Test Movie', 'fre')
    })

    test('should return eng for failed movie request', async () => {
      mockKyGet.mockReturnValue({
        ok: false,
      })

      const result = await getLanguageByIdAndType(123, 'movie')

      expect(result).toBe('eng')
      expect(mockCreatedOrUpdatedMedia).not.toHaveBeenCalled()
    })

    test('should handle english movies', async () => {
      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue({
          original_language: 'en',
          title: 'English Movie',
        }),
        ok: true,
      })

      const result = await getLanguageByIdAndType(456, 'movie')

      expect(result).toBe('eng')
      expect(mockCreatedOrUpdatedMedia).toHaveBeenCalledWith(456, 'movie', 'English Movie', 'eng')
    })
  })

  describe('getLanguageByIdAndType - show', () => {
    test('should return language for valid show', async () => {
      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue({
          name: 'Test Show',
          original_language: 'es',
        }),
        ok: true,
      })

      const result = await getLanguageByIdAndType(789, 'show')

      expect(result).toBe('spa')
      expect(mockCreatedOrUpdatedMedia).toHaveBeenCalledWith(789, 'show', 'Test Show', 'spa')
    })

    test('should return eng for failed show request', async () => {
      mockKyGet.mockReturnValue({
        ok: false,
      })

      const result = await getLanguageByIdAndType(789, 'show')

      expect(result).toBe('eng')
      expect(mockCreatedOrUpdatedMedia).not.toHaveBeenCalled()
    })

    test('should handle english shows', async () => {
      mockKyGet.mockReturnValue({
        json: mock().mockResolvedValue({
          name: 'English Show',
          original_language: 'en',
        }),
        ok: true,
      })

      const result = await getLanguageByIdAndType(999, 'show')

      expect(result).toBe('eng')
      expect(mockCreatedOrUpdatedMedia).toHaveBeenCalledWith(999, 'show', 'English Show', 'eng')
    })
  })

  describe('getLanguageByIdAndType - invalid type', () => {
    test('should throw error for invalid type', () => {
      expect(async () => {
        await getLanguageByIdAndType(123, 'invalid' as never)
      }).toThrow('Invalid type')
    })
  })
})
