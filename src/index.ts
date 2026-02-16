import { BunRuntime } from '@effect/platform-bun'
import { Layer } from 'effect'

import { LoggerLayer } from '@/config/logger'
import { HttpServerLive } from '@/providers/http_provider'

import { AppConfig } from './config/app_config'
import { SchedulerService } from './providers/scheduler_provider'
import { TelegramService } from './providers/telegram_provider'
import { MetadataService } from './services/metadata.service'
import { TranscodeService } from './services/transcode/transcode.service'

const ServicesLive = Layer.mergeAll(MetadataService.Default, TranscodeService.Default, LoggerLayer.pipe(Layer.provide(AppConfig.Default)))

const EntryPointsLive = Layer.mergeAll(HttpServerLive, SchedulerService.Default, TelegramService.Default)

const AppLive = EntryPointsLive.pipe(Layer.provide(ServicesLive))

BunRuntime.runMain(Layer.launch(AppLive))
