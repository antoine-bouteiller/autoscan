import { describe, expect, test } from 'bun:test'

import { isInArray } from '@/utils/array'

describe('isInArray', () => {
  const fruits = ['apple', 'banana', 'cherry'] as const

  test('should return true for a value present in the array', () => {
    expect(isInArray(fruits, 'banana')).toBe(true)
  })

  test('should return false for a value not present in the array', () => {
    expect(isInArray(fruits, 'grape')).toBe(false)
  })

  test('should return false for undefined', () => {
    expect(isInArray(fruits, undefined)).toBe(false)
  })

  test('should return false for null', () => {
    expect(isInArray(fruits, undefined)).toBe(false)
  })

  test('should work with number arrays', () => {
    const numbers = [1, 2, 3] as const
    expect(isInArray(numbers, 2)).toBe(true)
    expect(isInArray(numbers, 4)).toBe(false)
  })

  test('should return false for an empty array', () => {
    expect(isInArray([] as const, 'anything')).toBe(false)
  })
})
