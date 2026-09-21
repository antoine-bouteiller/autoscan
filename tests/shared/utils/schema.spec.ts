import { describe, expect, test } from 'bun:test'

import { Effect, Result, Schema } from 'effect'

import { NumberFromUnknown } from '@/shared/utils/schema'

const decode = Schema.decodeUnknownResult(NumberFromUnknown)
const decodeSync = (input: unknown) => Effect.runSync(Schema.decodeUnknownEffect(NumberFromUnknown)(input))

describe('NumberFromUnknown', () => {
  test('matches JavaScript number coercion', () => {
    expect(decodeSync('42')).toBe(42)
    expect(decodeSync('')).toBe(0)
    expect(decodeSync(true)).toBe(1)
  })

  test('rejects invalid values without throwing', () => {
    expect(Result.isFailure(decode('not a number'))).toBe(true)
    expect(Result.isFailure(decode('Infinity'))).toBe(true)
    expect(Result.isFailure(decode(Symbol('number')))).toBe(true)
  })
})
