import { describe, expect, test } from 'bun:test'

import { inversedEntriesOf, typedEntriesOf, typedKeyOf } from '@/shared/utils/object'

const sample = { alpha: 1, beta: 2, gamma: 3 } as const

describe('typedKeyOf', () => {
  test('should return all keys of the object', () => {
    expect(typedKeyOf(sample)).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('should return empty array for empty object', () => {
    expect(typedKeyOf({})).toEqual([])
  })
})

describe('typedEntriesOf', () => {
  test('should return typed entries', () => {
    expect(typedEntriesOf(sample)).toEqual([
      ['alpha', 1],
      ['beta', 2],
      ['gamma', 3],
    ])
  })

  test('should return empty array for empty object', () => {
    expect(typedEntriesOf({})).toEqual([])
  })
})

describe('inversedEntriesOf', () => {
  test('should swap keys and values', () => {
    const result = inversedEntriesOf(sample)
    expect(result).toEqual({ 1: 'alpha', 2: 'beta', 3: 'gamma' })
  })

  test('should work with string values', () => {
    const obj = { bar: 'world', foo: 'hello' } as const
    const result = inversedEntriesOf(obj)
    expect(result).toEqual({ hello: 'foo', world: 'bar' })
  })
})
