import { runMain } from '@effect/platform-bun/BunRuntime'
import { hasInterruptsOnly } from 'effect/Cause'
import { isFailure } from 'effect/Exit'
import { defaultTeardown, type Teardown } from 'effect/Runtime'

import { program } from '@/core/bootstrap'

const teardown: Teardown = (exit, onExit) => {
  if (isFailure(exit) && hasInterruptsOnly(exit.cause)) {
    onExit(0)
  } else {
    defaultTeardown(exit, onExit)
  }
}

runMain(program, { teardown })
