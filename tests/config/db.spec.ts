import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { makeDatabaseResource } from '@/config/db'

const makeOperations = (events: string[], migrationFails = false) => ({
  close: () => {
    events.push('close')
    return Promise.resolve()
  },
  migrate: () => {
    events.push('migrate')
    return migrationFails ? Promise.reject(new Error('migration failed')) : Promise.resolve()
  },
  open: () => {
    events.push('open')
    return { kind: 'sql' as const }
  },
})

describe('database resource lifecycle', () => {
  it.effect('closes once after successful scoped use', () =>
    Effect.gen(function* () {
      const events: string[] = []

      yield* Effect.scoped(makeDatabaseResource(makeOperations(events)))

      expect(events).toEqual(['open', 'migrate', 'close'])
    })
  )

  it.effect('[VC-4] closes once and fails with DatabaseConnectionError when migration fails', () =>
    Effect.gen(function* () {
      const events: string[] = []

      const error = yield* Effect.flip(Effect.scoped(makeDatabaseResource(makeOperations(events, true))))

      expect(error._tag).toBe('DatabaseConnectionError')
      expect(events).toEqual(['open', 'migrate', 'close'])
    })
  )
})
