import { container, TOKENS } from '#/core/container'
import { FfmpegClient } from '#/integrations/ffmpeg/ffmpeg.service'
import { HttpProvider } from '#/providers/http/http.provider'
import { SchedulerProvider } from '#/providers/scheduler/scheduler.provider'
import { TelegramProvider } from '#/providers/telegram/telegram.provider'

import {
  MockCloudflareClient,
  MockPlexClient,
  MockRadarrClient,
  MockSonarrClient,
  MockTelegramClient,
  MockTmdbClient,
  MockTraktClient,
} from './utils.ts'

container.register(TOKENS.PLEX_CLIENT, () => new MockPlexClient())
container.register(TOKENS.TMDB_CLIENT, () => new MockTmdbClient())
container.register(TOKENS.CLOUDFLARE_CLIENT, () => new MockCloudflareClient())
container.register(TOKENS.SONARR_CLIENT, () => new MockSonarrClient())
container.register(TOKENS.RADARR_CLIENT, () => new MockRadarrClient())
container.register(TOKENS.FFMPEG_CLIENT, () => new FfmpegClient())
container.register(TOKENS.TELEGRAM_CLIENT, () => new MockTelegramClient())
container.register(TOKENS.TRAKT_CLIENT, () => new MockTraktClient())
container.register(TOKENS.HTTP_PROVIDER, () => new HttpProvider({}))
container.register(TOKENS.SCHEDULER_PROVIDER, () => new SchedulerProvider())
container.register(TOKENS.TELEGRAM_PROVIDER, () => new TelegramProvider())
