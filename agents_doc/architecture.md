# Architecture

## Source Structure

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

## Test Structure

Tests mirror the source structure:

- `tests/features/` - Feature tests by domain
- `tests/utils/` - Utility function tests
- `tests/mocks.ts` - Mock implementations
- `tests/resources/` - Fixtures and sample videos

## Environment

Development mode disables Telegram bot. Production runs all providers (HTTP, Telegram, Scheduler).
