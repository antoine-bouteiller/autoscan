# Architecture

## Source Structure

- `src/index.ts` - Entry point: layer composition and `BunRuntime.runMain`
- `src/config/` - Configuration services (`AppConfig`, `DatabaseService`, `HttpClientLive`, `LoggerLayer`)
- `src/errors.ts` - Centralized error definitions using `Schema.TaggedError`
- `src/schemas/` - Effect Schema definitions for validation (plex, tmdb, radarr, sonarr, cloudflare, ffmpeg, queue)
- `src/integrations/` - External service clients (`PlexClient`, `TmdbClient`, `CloudflareClient`, `FfmpegClient`)
  - `arr/` - Shared Arr factory + `RadarrClient`, `SonarrClient`
- `src/services/` - Business logic (`CleanupService`, `DnsService`, `LanguageService`, `MetadataService`, `TelegramService`)
  - `transcode/` - `TranscodeService` with queue-based processing
- `src/repositories/` - Data access layer (`MediaRepository` over Drizzle ORM)
- `src/jobs/` - Scheduled job effects (cleanup, dyndns, language, transcode)
- `src/controllers/` - HTTP & Telegram request handlers
- `src/providers/` - Top-level providers (`HttpServerLive`, `SchedulerService`, `TelegramService`)
- `src/database/` - Drizzle schema definitions
- `src/types/` - Type definitions
- `src/utils/` - Utility functions (`spawn` for CLI commands, array/object helpers)

## Test Structure

Tests mirror the source structure:

- `tests/services/` - Service tests by domain
- `tests/repositories/` - Repository tests
- `tests/utils/` - Utility function tests
- `tests/mocks.ts` - Mock implementations
- `tests/resources/` - Fixtures and sample videos

## Environment

Development mode disables Telegram bot. Production runs all providers (HTTP, Telegram, Scheduler).

## Layer Dependency Graph

```
ConfigProvider.fromEnv()
  └─ AppConfig
       ├─ LoggerLayer
       ├─ DatabaseService → MediaRepository
       ├─ PlexClient ──────────┐
       ├─ TmdbClient ──────────┼─ MetadataService
       ├─ RadarrClient          │
       ├─ SonarrClient          │
       ├─ CloudflareClient      │
       └─ FfmpegClient ────────┘
                                │
  RuntimeDeps = merge all above │
       ├─ SchedulerService (cron jobs)
       ├─ TelegramService (bot)
       └─ HttpServerLive (HTTP API)
```

Final app: `BunRuntime.runMain(Layer.launch(AppLive).pipe(Effect.scoped))`
