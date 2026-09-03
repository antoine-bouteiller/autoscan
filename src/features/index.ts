import { languageSyncFeature } from './language_sync/feature.js'
import { queueCleanupFeature } from './queue_cleanup/feature.js'
import { sendMessageFeature } from './send_message/feature.js'
import { transcodingFeature } from './transcoding/feature.js'

export const features = [languageSyncFeature, queueCleanupFeature, sendMessageFeature, transcodingFeature]
