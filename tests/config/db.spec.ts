import { describe, expect, it } from '@tests/it'
import { Effect } from 'effect'

import { makeDatabaseResource } from '@/config/db'

const makeOperations = (events: string[], migrationFails = false) => ({
  close: async () => {
    events.push('close')
  },
  construct: () => {
    events.push('construct')
    return { kind: 'db' as const }
  },
  migrate: async () => {
    events.push('migrate')
    if (migrationFails) {
      throw new Error('migration failed')
    }
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

      expect(events).toEqual(['open', 'construct', 'migrate', 'close'])
    })
  )

  it.effect('closes once when migration fails', () =>
    Effect.gen(function* () {
      const events: string[] = []

      const exit = yield* Effect.exit(Effect.scoped(makeDatabaseResource(makeOperations(events, true))))

      expect(exit._tag).toBe('Failure')
      expect(events).toEqual(['open', 'construct', 'migrate', 'close'])
    })
  )
})
