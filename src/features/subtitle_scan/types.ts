import { type Effect } from 'effect'

import { type getCompleteMediaDetails } from '@/domains/media/services/metadata.service'

export type SubtitleScanMedia = Pick<
  Effect.Success<ReturnType<typeof getCompleteMediaDetails>>,
  'file' | 'mediaTitle' | 'mediaType' | 'preferredLanguage'
>
