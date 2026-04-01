type Factory<Value> = () => Value

class Container {
  private readonly factories = new Map<string, Factory<unknown>>()
  private readonly instances = new Map<string, unknown>()

  register<Value>(token: string, factory: Factory<Value>): void {
    this.factories.set(token, factory)
  }

  resolve<Value>(token: string): Value {
    const cached = this.instances.get(token)
    if (cached) {
      // oxlint-disable-next-line no-unsafe-type-assertion
      return cached as Value
    }

    const factory = this.factories.get(token)
    if (!factory) {
      throw new Error(`No factory registered for token: ${token}`)
    }

    // oxlint-disable-next-line no-unsafe-type-assertion
    const instance = factory() as Value
    this.instances.set(token, instance)
    return instance
  }

  reset(): void {
    this.instances.clear()
  }
}

export const container = new Container()

export const TOKENS = {
  CLOUDFLARE_CLIENT: 'cloudflareClient',
  FFMPEG_CLIENT: 'ffmpegClient',
  HTTP_PROVIDER: 'httpProvider',
  PLEX_CLIENT: 'plexClient',
  RADARR_CLIENT: 'radarrClient',
  SCHEDULER_PROVIDER: 'schedulerProvider',
  SONARR_CLIENT: 'sonarrClient',
  TELEGRAM_CLIENT: 'telegramClient',
  TELEGRAM_PROVIDER: 'telegramProvider',
  TMDB_CLIENT: 'tmdbClient',
  TRAKT_CLIENT: 'traktClient',
} as const
