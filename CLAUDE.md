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

- `src/app/controllers/` - HTTP and task controllers
- `src/app/integrations/` - External service clients (Radarr, Sonarr, Plex, TMDB, Cloudflare, FFmpeg)
- `src/app/validators/` - Request validation
- `src/providers/` - HTTP, Telegram, and Scheduler providers
- `src/database/` - Database schema
- `src/types/` - Type definitions

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
