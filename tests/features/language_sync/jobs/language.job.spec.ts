import { provideTest } from '@tests/effect'
import { describe, expect, it } from '@tests/it'
import { MockPlexClient } from '@tests/mocks/plex.mock'
import { Effect } from 'effect'

import { updatePlexSelectedLanguages } from '@/features/language_sync/jobs/language.job'

class EmptyPlexClient extends MockPlexClient {
  override get getSections() {
    return Effect.succeed([])
  }
}

describe('updatePlexSelectedLanguages', () => {
  it.live('handles an empty library', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(updatePlexSelectedLanguages, { plex: new EmptyPlexClient() })).toBeUndefined()
    })
  )

  it.live('continues through the mock library', () =>
    Effect.gen(function* () {
      expect(yield* provideTest(updatePlexSelectedLanguages, { plex: new MockPlexClient() })).toBeUndefined()
    })
  )
})
