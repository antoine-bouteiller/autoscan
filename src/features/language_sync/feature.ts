import { defineFeature } from '@/core/feature'

import { setLanguageConversation } from './commands/language.command.js'
import { updatePlexSelectedLanguages } from './jobs/language.job.js'

export const languageSyncFeature = defineFeature({
  conversations: {
    '/setlanguage': setLanguageConversation,
  },
  jobs: [{ handler: updatePlexSelectedLanguages, name: 'Language Sync', pattern: '0 */12 * * *' }],
  name: 'language_sync',
})
