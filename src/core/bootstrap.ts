import env from '@/config/env'
import { container, TOKENS } from '@/core/container'
import { registerFeatures } from '@/core/feature'
import { features } from '@/features/index'
import { RadarrClient } from '@/integrations/arr/radarr.service'
import { SonarrClient } from '@/integrations/arr/sonarr.service'
import { FfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { PlexClient } from '@/integrations/plex/plex.service'
import { TelegramClient } from '@/integrations/telegram/telegram.service'
import { TmdbClient } from '@/integrations/tmdb/tmdb.service'
import { TraktClient } from '@/integrations/trakt/trakt.service'
import { HttpProvider } from '@/providers/http/http.provider'
import { SchedulerProvider } from '@/providers/scheduler/scheduler.provider'
import { TelegramProvider } from '@/providers/telegram/telegram.provider'

container.register(TOKENS.HTTP_PROVIDER, () => new HttpProvider({ port: 3030 }))
container.register(TOKENS.SCHEDULER_PROVIDER, () => new SchedulerProvider())
container.register(TOKENS.TELEGRAM_CLIENT, () => new TelegramClient(env.TELEGRAM_TOKEN))
container.register(TOKENS.TELEGRAM_PROVIDER, () => new TelegramProvider())

container.register(
  TOKENS.TRAKT_CLIENT,
  () =>
    new TraktClient({
      clientId: env.TRAKT_CLIENT_ID,
      clientSecret: env.TRAKT_CLIENT_SECRET,
    })
)

container.register(
  TOKENS.RADARR_CLIENT,
  () =>
    new RadarrClient({
      apiKey: env.RADARR_API_KEY,
      apiUrl: env.RADARR_API_URL,
    })
)

container.register(
  TOKENS.SONARR_CLIENT,
  () =>
    new SonarrClient({
      apiKey: env.SONARR_API_KEY,
      apiUrl: env.SONARR_API_URL,
    })
)

container.register(
  TOKENS.PLEX_CLIENT,
  () =>
    new PlexClient({
      token: env.PLEX_TOKEN,
      url: env.PLEX_URL,
    })
)

container.register(
  TOKENS.TMDB_CLIENT,
  () =>
    new TmdbClient({
      apiToken: env.TMDB_API_TOKEN,
      apiUrl: env.TMDB_API_URL,
    })
)

container.register(TOKENS.FFMPEG_CLIENT, () => new FfmpegClient())

registerFeatures(features)
