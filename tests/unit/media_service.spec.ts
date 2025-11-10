import {
  countMediaByType,
  createdOrUpdatedMedia,
  getMediaByIdAndType,
  getMediaByTypeWithPagination,
} from '@/app/services/media/media_service'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock db
const mockSelect = mock()
const mockFrom = mock()
const mockWhere = mock()
const mockInsert = mock()
const mockValues = mock()
const mockOnConflictDoUpdate = mock()
const mockOrderBy = mock()
const mockOffset = mock()
const mockLimit = mock()
const mockThen = mock()

const mockDb = {
  insert: mockInsert,
  select: mockSelect,
}

mock.module('@/config/db', () => ({
  db: mockDb,
}))

// Mock schema
const mockMediaTable = {
  originalLanguage: 'originalLanguage',
  title: 'title',
  tmdbId: 'tmdbId',
  type: 'type',
}

mock.module('@/database/schema', () => ({
  media: mockMediaTable,
}))

describe('MediaService', () => {
  beforeEach(() => {
    mockSelect.mockReset()
    mockFrom.mockReset()
    mockWhere.mockReset()
    mockInsert.mockReset()
    mockValues.mockReset()
    mockOnConflictDoUpdate.mockReset()
    mockOrderBy.mockReset()
    mockOffset.mockReset()
    mockLimit.mockReset()
    mockThen.mockReset()
  })

  describe('countMediaByType', () => {
    test('should return count of movies', () => {
      mockSelect.mockReturnValue({ from: mockFrom })
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue([{ count: 5 }])

      const result = countMediaByType('movie')

      expect(mockSelect).toHaveBeenCalled()
      expect(mockFrom).toHaveBeenCalledWith(mockMediaTable)
      expect(result).toBeDefined()
    })

    test('should return count of shows', () => {
      mockSelect.mockReturnValue({ from: mockFrom })
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue([{ count: 3 }])

      const result = countMediaByType('show')

      expect(mockSelect).toHaveBeenCalled()
      expect(mockFrom).toHaveBeenCalledWith(mockMediaTable)
      expect(result).toBeDefined()
    })
  })

  describe('createdOrUpdatedMedia', () => {
    test('should insert new media', () => {
      mockInsert.mockReturnValue({ values: mockValues })
      mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
      mockOnConflictDoUpdate.mockResolvedValue({})

      const result = createdOrUpdatedMedia(123, 'movie', 'Test Movie', 'eng')

      expect(mockInsert).toHaveBeenCalledWith(mockMediaTable)
      expect(mockValues).toHaveBeenCalledWith({
        originalLanguage: 'eng',
        title: 'Test Movie',
        tmdbId: 123,
        type: 'movie',
      })
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith({
        set: { originalLanguage: 'eng', title: 'Test Movie' },
        target: [mockMediaTable.tmdbId, mockMediaTable.type],
      })
      expect(result).toBeDefined()
    })

    test('should update existing media', () => {
      mockInsert.mockReturnValue({ values: mockValues })
      mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
      mockOnConflictDoUpdate.mockResolvedValue({})

      const result = createdOrUpdatedMedia(456, 'show', 'Test Show', 'fre')

      expect(mockInsert).toHaveBeenCalledWith(mockMediaTable)
      expect(mockValues).toHaveBeenCalledWith({
        originalLanguage: 'fre',
        title: 'Test Show',
        tmdbId: 456,
        type: 'show',
      })
      expect(result).toBeDefined()
    })
  })

  describe('getMediaByIdAndType', () => {
    test('should return media by id and type', async () => {
      const mockMedia = {
        id: 1,
        originalLanguage: 'eng',
        title: 'Test Movie',
        tmdbId: 123,
        type: 'movie',
      }

      const mockChain = {
        // @ts-expect-error - Using then for query chaining
        then: (fn: (value: unknown[]) => unknown) => fn([mockMedia]),
      }

      mockSelect.mockReturnValue({ from: mockFrom })
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue(mockChain)

      const result = await getMediaByIdAndType(123, 'movie')

      expect(result).toEqual(mockMedia)
    })

    test('should return undefined if media not found', async () => {
      const mockChain = {
        // @ts-expect-error - Using then for query chaining
        then: (fn: (value: unknown[]) => unknown) => fn([]),
      }

      mockSelect.mockReturnValue({ from: mockFrom })
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue(mockChain)

      const result = await getMediaByIdAndType(999, 'movie')

      expect(result).toBeUndefined()
    })
  })

  describe('getMediaByTypeWithPagination', () => {
    test('should return paginated movies', () => {
      const mockMovies = [
        {
          id: 1,
          originalLanguage: 'eng',
          title: 'Movie 1',
          tmdbId: 1,
          type: 'movie',
        },
        {
          id: 2,
          originalLanguage: 'eng',
          title: 'Movie 2',
          tmdbId: 2,
          type: 'movie',
        },
      ]

      mockSelect.mockReturnValue({ from: mockFrom })
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue({ orderBy: mockOrderBy })
      mockOrderBy.mockReturnValue({ offset: mockOffset })
      mockOffset.mockReturnValue({ limit: mockLimit })
      mockLimit.mockReturnValue(mockMovies)

      const result = getMediaByTypeWithPagination('movie', 0, 10)

      expect(mockSelect).toHaveBeenCalled()
      expect(mockFrom).toHaveBeenCalledWith(mockMediaTable)
      expect(mockOrderBy).toHaveBeenCalled()
      expect(mockOffset).toHaveBeenCalledWith(0)
      expect(mockLimit).toHaveBeenCalledWith(10)
      expect(result).toBeDefined()
    })

    test('should return second page of shows', () => {
      const mockShows = [
        {
          id: 11,
          originalLanguage: 'fre',
          title: 'Show 11',
          tmdbId: 11,
          type: 'show',
        },
      ]

      mockSelect.mockReturnValue({ from: mockFrom })
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue({ orderBy: mockOrderBy })
      mockOrderBy.mockReturnValue({ offset: mockOffset })
      mockOffset.mockReturnValue({ limit: mockLimit })
      mockLimit.mockReturnValue(mockShows)

      const result = getMediaByTypeWithPagination('show', 1, 10)

      expect(mockOffset).toHaveBeenCalledWith(10)
      expect(mockLimit).toHaveBeenCalledWith(10)
      expect(result).toBeDefined()
    })

    test('should handle custom page sizes', () => {
      mockSelect.mockReturnValue({ from: mockFrom })
      mockFrom.mockReturnValue({ where: mockWhere })
      mockWhere.mockReturnValue({ orderBy: mockOrderBy })
      mockOrderBy.mockReturnValue({ offset: mockOffset })
      mockOffset.mockReturnValue({ limit: mockLimit })
      mockLimit.mockReturnValue([])

      const result = getMediaByTypeWithPagination('movie', 2, 25)

      expect(mockOffset).toHaveBeenCalledWith(50)
      expect(mockLimit).toHaveBeenCalledWith(25)
      expect(result).toBeDefined()
    })
  })
})
