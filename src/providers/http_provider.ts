import { HttpMiddleware, HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform'
import { BunHttpServer } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import { radarrWebhook } from '@/controllers/radarr.controller'
import { sonarrWebhook } from '@/controllers/sonarr.controller'
import { transcodeAll } from '@/controllers/transcode.controller'

const router = HttpRouter.empty.pipe(
  HttpRouter.post('/radarr', radarrWebhook),
  HttpRouter.post('/sonarr', sonarrWebhook),
  HttpRouter.post('/transcode/all', transcodeAll),
  HttpRouter.get('/health', Effect.succeed(HttpServerResponse.text('ok')))
)

export const HttpServerLive = router.pipe(
  HttpServer.serve(HttpMiddleware.logger),
  Layer.provide(BunHttpServer.layer({ hostname: '0.0.0.0', port: 3030 }))
)
