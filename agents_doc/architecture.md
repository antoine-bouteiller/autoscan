# Architecture

## Source Structure

- `src/controllers/` - HTTP & Telegram request handlers
- `src/validators/` - Request payload validators (Radarr, Sonarr)
- `src/services/` - Business logic (cleanup, DNS, language, metadata, telegram, transcode)
- `src/repositories/` - Data access layer (media database operations)
- `src/jobs/` - Scheduled tasks (cleanup, language, transcode)
- `src/middleware/` - HTTP middleware (error handler, validation, compose)
- `src/integrations/` - External service clients (Radarr, Sonarr, Plex, TMDB, Cloudflare, FFmpeg)
- `src/providers/` - HTTP, Telegram, and Scheduler providers
- `src/core/` - DI container, bootstrap, response helpers
- `src/config/` - Application configuration
- `src/database/` - Database schema
- `src/errors/` - Error classes
- `src/types/` - Type definitions
- `src/utils/` - Utility functions

## Test Structure

Tests mirror the source structure:

- `tests/services/` - Service tests by domain
- `tests/repositories/` - Repository tests
- `tests/utils/` - Utility function tests
- `tests/mocks.ts` - Mock implementations
- `tests/resources/` - Fixtures and sample videos

## Environment

Development mode disables Telegram bot. Production runs all providers (HTTP, Telegram, Scheduler).
