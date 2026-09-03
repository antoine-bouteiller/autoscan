import { defineFeature } from '@/core/feature'

import { plexAuthCommand } from './commands/plex.command.js'

export const plexAuthFeature = defineFeature({
  commands: {
    '/plex': plexAuthCommand,
  },
  name: 'plex_auth',
})
