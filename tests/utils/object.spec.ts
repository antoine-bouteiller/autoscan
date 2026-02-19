import { describe, expect, test } from 'vitest'

import { inversedEntriesOf, isKeyOf, isValueOf, typedEntriesOf, typedKeyOf } from '@/utils/object'

const sample = { a: 1, b: 2, c: 3 } as const

describe('isKeyOf', () => {
  test('should return true for a valid key', () => {
    expect(isKeyOf(sample, 'a')).toBe(true)
  })

  test('should return false for an invalid key', () => {
    expect(isKeyOf(sample, 'd')).toBe(false)
  })

  test('should return false for non-string values', () => {
    expect(isKeyOf(sample, 1)).toBe(false)
    expect(isKeyOf(sample, undefined)).toBe(false)
    expect(isKeyOf(sample, undefined)).toBe(false)
  })
})

describe('isValueOf', () => {
  test('should return true for a valid value', () => {
    expect(isValueOf(sample, 1)).toBe(true)
  })

  test('should return false for an invalid value', () => {
    expect(isValueOf(sample, 4)).toBe(false)
  })

  test('should return false for undefined', () => {
    expect(isValueOf(sample, undefined)).toBe(false)
  })
})

describe('typedKeyOf', () => {
  test('should return all keys of the object', () => {
    expect(typedKeyOf(sample)).toEqual(['a', 'b', 'c'])
  })

  test('should return empty array for empty object', () => {
    expect(typedKeyOf({})).toEqual([])
  })
})

describe('typedEntriesOf', () => {
  test('should return typed entries', () => {
    expect(typedEntriesOf(sample)).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  test('should return empty array for empty object', () => {
    expect(typedEntriesOf({})).toEqual([])
  })
})

describe('inversedEntriesOf', () => {
  test('should swap keys and values', () => {
    const result = inversedEntriesOf(sample)
    expect(result).toEqual({ 1: 'a', 2: 'b', 3: 'c' })
  })

  test('should work with string values', () => {
    const obj = { x: 'hello', y: 'world' } as const
    const result = inversedEntriesOf(obj)
    expect(result).toEqual({ hello: 'x', world: 'y' })
  })
})
