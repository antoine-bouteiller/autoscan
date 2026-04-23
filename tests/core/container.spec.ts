import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import { Container, type Token } from '#/core/container'

interface Counter {
  value: number
}

describe('Container', () => {
  let container: Container
  const counterToken: Token<Counter> = { key: 'counter' }
  const stringToken: Token<string> = { key: 'string' }
  const nullableToken: Token<Counter | undefined> = { key: 'nullable' }

  beforeEach(() => {
    container = new Container()
  })

  test('runs factory lazily on first resolve', () => {
    const factory = vi.fn(() => ({ value: 1 }))
    container.register(counterToken, factory)

    expect(factory).not.toHaveBeenCalled()

    const instance = container.resolve(counterToken)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(instance).toEqual({ value: 1 })
  })

  test('returns cached instance on subsequent resolves', () => {
    const factory = vi.fn(() => ({ value: 42 }))
    container.register(counterToken, factory)

    const first = container.resolve(counterToken)
    const second = container.resolve(counterToken)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
  })

  test('throws when resolving a token with no registered factory', () => {
    expect(() => container.resolve(stringToken)).toThrow('No factory registered for token: string')
  })

  test('reset clears instances but keeps factories', () => {
    const factory = vi.fn(() => ({ value: 1 }))
    container.register(counterToken, factory)

    container.resolve(counterToken)
    container.reset()
    container.resolve(counterToken)

    expect(factory).toHaveBeenCalledTimes(2)
  })

  test('re-registering a token overwrites the previous factory', () => {
    container.register(stringToken, () => 'first')
    container.register(stringToken, () => 'second')

    expect(container.resolve(stringToken)).toBe('second')
  })

  test('caches falsy return values so the factory runs only once', () => {
    const factory = vi.fn<() => Counter | undefined>(() => undefined)
    container.register(nullableToken, factory)

    const first = container.resolve(nullableToken)
    const second = container.resolve(nullableToken)

    expect(first).toBeUndefined()
    expect(second).toBeUndefined()
    expect(factory).toHaveBeenCalledTimes(1)
  })

  test('does not cache when the factory throws and retries on next resolve', () => {
    const factory = vi
      .fn<() => Counter>()
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })
      .mockImplementationOnce(() => ({ value: 99 }))
    container.register(counterToken, factory)

    expect(() => container.resolve(counterToken)).toThrow('boom')
    expect(container.resolve(counterToken)).toEqual({ value: 99 })
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
