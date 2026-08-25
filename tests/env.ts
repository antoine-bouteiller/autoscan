import { BunServices } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import { Env, loadEnv } from '@/config/env'

export const testEnv = await Effect.runPromise(loadEnv.pipe(Effect.provide(BunServices.layer)))

export const EnvTestLayer = Layer.succeed(Env, testEnv)
