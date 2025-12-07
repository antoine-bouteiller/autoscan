# Autoscan

Media automation service that integrates with Radarr, Sonarr, Plex, and TMDB.

## Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Database**: SQLite with Drizzle ORM
- **Validation**: arktype
- **HTTP**: ky
- **Logging**: pino
- **Bot**: Grammy (Telegram)
- **Scheduler**: croner

## Architecture

### Source Structure

- `src/features/` - Feature modules organized by domain
  - `arr/` - Radarr and Sonarr webhook handlers
  - `cleanup/` - Download queue cleanup service
  - `dns/` - Dynamic DNS management
  - `language/` - Audio language selection
  - `media/` - Media database operations
  - `metadata/` - TMDB metadata fetching
  - `telegram/` - Telegram bot commands
  - `transcode/` - FFmpeg transcoding pipeline
- `src/integrations/` - External service clients (Radarr, Sonarr, Plex, TMDB, Cloudflare, FFmpeg)
- `src/providers/` - HTTP, Telegram, and Scheduler providers
- `src/config/` - Application configuration
- `src/database/` - Database schema
- `src/types/` - Type definitions
- `src/utils/` - Utility functions

### Test Structure

Tests mirror the source structure for easy navigation:

- `tests/features/` - Feature tests organized by domain
  - `cleanup/service.spec.ts` - Cleanup service tests
  - `language/service.spec.ts` - Language service tests
  - `media/service.spec.ts` - Media service tests
  - `metadata/service.spec.ts` - Metadata service tests
  - `transcode/service.spec.ts` - End-to-end transcode tests
  - `transcode/helpers/` - Transcode helper unit tests
    - `audio.spec.ts` - Audio stream processing
    - `subtitle.spec.ts` - Subtitle stream processing
    - `video.spec.ts` - Video stream processing
- `tests/utils/` - Utility function tests
- `tests/mocks.ts` - Mock implementations
- `tests/resources/` - Test Resources files (non-test code)
  - `fixtures/` - Test fixtures and mock data
  - `videos/` - Sample video files for integration tests
  - `config.ts` - Test configuration and helpers

## Key Features

- Webhook handlers for Radarr/Sonarr events
- Telegram bot for management and notifications
- Scheduled tasks: transcoding, cleanup, language sync, dynamic DNS
- FFmpeg integration for media processing

## Commands

```bash
bun dev          # Development with watch mode
bun test         # Run tests
bun run build    # Compile binary
bun lint     # Lint with oxlint
bun format   # Format with oxfmt
bun typecheck # Type check
```

## Environment

Development mode disables Telegram bot. Production runs all providers (HTTP, Telegram, Scheduler).
