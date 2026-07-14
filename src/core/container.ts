import { type IRadarrClient } from '@/integrations/arr/radarr.service'
import { type ISonarrClient } from '@/integrations/arr/sonarr.service'
import { type FfmpegClient } from '@/integrations/ffmpeg/ffmpeg.service'
import { type IPlexClient } from '@/integrations/plex/plex.service'
import { type ITelegramClient } from '@/integrations/telegram/telegram.service'
import { type ITmdbClient } from '@/integrations/tmdb/tmdb.service'
import { type ITraktClient } from '@/integrations/trakt/trakt.service'
import { type HttpProvider } from '@/providers/http/http.provider'
import { type SchedulerProvider } from '@/providers/scheduler/scheduler.provider'
import { type TelegramProvider } from '@/providers/telegram/telegram.provider'

export interface Token<TValue> {
  readonly key: string
  readonly _type?: (value: TValue) => TValue
}

type Factory<TValue> = () => TValue

const createToken = <TValue>(key: string): Token<TValue> => ({ key })

export const TOKENS = {
  FFMPEG_CLIENT: createToken<FfmpegClient>('ffmpegClient'),
  HTTP_PROVIDER: createToken<HttpProvider>('httpProvider'),
  PLEX_CLIENT: createToken<IPlexClient>('plexClient'),
  RADARR_CLIENT: createToken<IRadarrClient>('radarrClient'),
  SCHEDULER_PROVIDER: createToken<SchedulerProvider>('schedulerProvider'),
  SONARR_CLIENT: createToken<ISonarrClient>('sonarrClient'),
  TELEGRAM_CLIENT: createToken<ITelegramClient>('telegramClient'),
  TELEGRAM_PROVIDER: createToken<TelegramProvider>('telegramProvider'),
  TMDB_CLIENT: createToken<ITmdbClient>('tmdbClient'),
  TRAKT_CLIENT: createToken<ITraktClient>('traktClient'),
}

export class Container {
  private readonly factories = new Map<string, Factory<unknown>>()
  private readonly instances = new Map<string, unknown>()

  register<TValue>(token: Token<TValue>, factory: Factory<TValue>): void {
    this.factories.set(token.key, factory)
  }

  resolve<TValue>(token: Token<TValue>): TValue {
    if (this.instances.has(token.key)) {
      // Invariant: register<TValue> guarantees the stored value is TValue.
      // oxlint-disable-next-line no-unsafe-type-assertion
      return this.instances.get(token.key) as TValue
    }

    const factory = this.factories.get(token.key)
    if (!factory) {
      throw new Error(`No factory registered for token: ${token.key}`)
    }

    // Invariant: register<TValue> guarantees factory's return is TValue.
    // oxlint-disable-next-line no-unsafe-type-assertion
    const instance = factory() as TValue
    this.instances.set(token.key, instance)
    return instance
  }

  reset(): void {
    this.instances.clear()
  }
}

export const container = new Container()
