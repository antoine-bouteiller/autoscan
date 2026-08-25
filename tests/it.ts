import { test } from 'bun:test'

import { Effect, type Layer, type Scope } from 'effect'
import { TestClock } from 'effect/testing'
import { FetchHttpClient } from 'effect/unstable/http'

export { describe, expect } from 'bun:test'

type Options = number | { timeout?: number }
const timeoutOf = (opts?: Options) => (typeof opts === 'number' ? opts : opts?.timeout)

/** Virtual time by default. */
const testEnv: Layer.Layer<TestClock.TestClock> = TestClock.layer()

// The HTTP client resolves its fetch implementation once per runtime, so tests delegate to whichever spy is installed when the request runs.
const spiedFetch: typeof globalThis.fetch = Object.assign((...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args), {
  preconnect: (...args: Parameters<typeof globalThis.fetch.preconnect>) => globalThis.fetch.preconnect(...args),
})

const withFetch = <Success, Failure, Requirements>(eff: Effect.Effect<Success, Failure, Requirements>) =>
  Effect.provideService(eff, FetchHttpClient.Fetch, spiedFetch)

const run = <Success, Failure>(eff: Effect.Effect<Success, Failure, TestClock.TestClock>) =>
  Effect.runPromise(Effect.provide(withFetch(eff), testEnv))

const mkEffect =
  (runner: typeof test) =>
  <Success, Failure>(name: string, fn: () => Effect.Effect<Success, Failure, TestClock.TestClock>, opts?: Options) => {
    const timeout = timeoutOf(opts)
    runner(name, () => run(fn()), timeout === undefined ? undefined : { timeout })
  }

const mkScoped =
  (runner: typeof test) =>
  <Success, Failure>(name: string, fn: () => Effect.Effect<Success, Failure, TestClock.TestClock | Scope.Scope>, opts?: Options) => {
    const timeout = timeoutOf(opts)
    runner(name, () => run(Effect.scoped(fn())), timeout === undefined ? undefined : { timeout })
  }

/** Real clock. Required for tests that mix real I/O with Effect.sleep/timeout. */
const mkLive =
  (runner: typeof test) =>
  <Success, Failure>(name: string, fn: () => Effect.Effect<Success, Failure>, opts?: Options) => {
    const timeout = timeoutOf(opts)
    runner(name, () => Effect.runPromise(withFetch(fn())), timeout === undefined ? undefined : { timeout })
  }

const mods = <Runner extends object>(make: (runner: typeof test) => Runner): Runner & { skip: Runner } =>
  Object.assign(make(test), { skip: make(test.skip) })

// @effect-diagnostics-next-line missingPipeableSignature:off
export const it = Object.assign(test, {
  effect: mods(mkEffect),
  live: mods(mkLive),
  scoped: mods(mkScoped),
})
