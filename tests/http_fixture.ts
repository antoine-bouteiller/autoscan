import { it } from 'vite-plus/test'

import { container, TOKENS } from '#/core/container'
import { registerFeatures } from '#/core/feature'
import { sendMessageFeature } from '#/features/send_message/feature'
import { transcodingFeature } from '#/features/transcoding/feature'

registerFeatures([transcodingFeature, sendMessageFeature])
const http = container.resolve(TOKENS.HTTP_PROVIDER)

export const testWithHttpProvider = it.extend('http', async () => ({
  inject: http.inject.bind(http),
}))
