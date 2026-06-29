import { container, TOKENS } from '#/core/container'
import { registerFeatures } from '#/core/feature'
import { sendMessageFeature } from '#/features/send_message/feature'
import { transcodingFeature } from '#/features/transcoding/feature'

registerFeatures([transcodingFeature, sendMessageFeature])

export const http = container.resolve(TOKENS.HTTP_PROVIDER)
