import { describe, expect, it } from '@effect/vitest'

import { isInArray } from '@/utils/array'

describe('isInArray', () => {
  const fruits = ['apple', 'banana', 'cherry'] as const

  it('should return true for a value present in the array', () => {
    expect(isInArray(fruits, 'banana')).toBe(true)
  })

  it('should return false for a value not present in the array', () => {
    expect(isInArray(fruits, 'grape')).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(isInArray(fruits, undefined)).toBe(false)
  })

  it('should return false for null', () => {
    expect(isInArray(fruits, undefined)).toBe(false)
  })

  it('should work with number arrays', () => {
    const numbers = [1, 2, 3] as const
    expect(isInArray(numbers, 2)).toBe(true)
    expect(isInArray(numbers, 4)).toBe(false)
  })

  it('should return false for an empty array', () => {
    expect(isInArray([] as const, 'anything')).toBe(false)
  })
})
