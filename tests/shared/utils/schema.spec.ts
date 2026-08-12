import { describe, expect, test } from 'bun:test'

import { Result, Schema } from 'effect'

import { NumberFromUnknown } from '@/shared/utils/schema'

const decode = Schema.decodeUnknownResult(NumberFromUnknown)

describe('NumberFromUnknown', () => {
  test('matches JavaScript number coercion', () => {
    expect(Schema.decodeSync(NumberFromUnknown)('42')).toBe(42)
    expect(Schema.decodeSync(NumberFromUnknown)('')).toBe(0)
    expect(Schema.decodeSync(NumberFromUnknown)(true)).toBe(1)
  })

  test('rejects invalid values without throwing', () => {
    expect(Result.isFailure(decode('not a number'))).toBe(true)
    expect(Result.isFailure(decode('Infinity'))).toBe(true)
    expect(Result.isFailure(decode(Symbol('number')))).toBe(true)
  })
})
