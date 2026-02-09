import env from '@/config/env'
import { container, TOKENS } from '@/core/container'
import { RadarrClient } from '@/integrations/arr/radarr.service'
import { SonarrClient } from '@/integrations/arr/sonarr.service'
import { CloudflareClient } from '@/integrations/cloudflare.service'
import { FfmpegClient } from '@/integrations/ffmpeg.service'
import { PlexClient } from '@/integrations/plex.service'
import { TmdbClient } from '@/integrations/tmdb.service'
import { HttpProvider } from '@/providers/http_provider'
import { SchedulerProvider } from '@/providers/scheduler_provider'
import { TelegramProvider } from '@/providers/telegram_provider'

container.register(TOKENS.HTTP_PROVIDER, () => new HttpProvider({ port: 3030 }))
container.register(TOKENS.SCHEDULER_PROVIDER, () => new SchedulerProvider())
container.register(TOKENS.TELEGRAM_PROVIDER, () => new TelegramProvider())

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

container.register(
  TOKENS.CLOUDFLARE_CLIENT,
  () =>
    new CloudflareClient({
      token: env.CLOUDFLARE_TOKEN,
    })
)

container.register(TOKENS.FFMPEG_CLIENT, () => new FfmpegClient())
