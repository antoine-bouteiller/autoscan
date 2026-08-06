import { expect, test } from 'bun:test'

import { runMain } from '@effect/platform-bun/BunRuntime'
import { Context, Effect, Layer } from 'effect'

class Greeting extends Context.Service<Greeting, { readonly value: string }>()('Greeting') {}

const GreetingLive = Layer.succeed(Greeting, { value: 'hello' })

test('runs an Effect v4 program with a typed service', async () => {
  const program = Effect.gen(function* () {
    const greeting = yield* Greeting
    return greeting.value
  }).pipe(Effect.provide(GreetingLive))

  expect(await Effect.runPromise(program)).toBe('hello')
  expect(runMain).toBeFunction()
})
