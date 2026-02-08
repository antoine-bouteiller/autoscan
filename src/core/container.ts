type Factory<T> = () => T

interface ContainerInstance {
  container: Container
  TOKENS: typeof TOKENS
}

class Container {
  private factories = new Map<string, Factory<unknown>>()
  private instances = new Map<string, unknown>()

  register<T>(token: string, factory: Factory<T>): void {
    this.factories.set(token, factory)
  }

  resolve<T>(token: string): T {
    const cached = this.instances.get(token)
    if (cached) {
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
      return cached as T
    }

    const factory = this.factories.get(token)
    if (!factory) {
      throw new Error(`No factory registered for token: ${token}`)
    }

    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    const instance = factory() as T
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
  TELEGRAM_PROVIDER: 'telegramProvider',
  TMDB_CLIENT: 'tmdbClient',
} as const

export const getContainerInstance = (): ContainerInstance => ({ container, TOKENS })
