# Autoscan

Media automation service that integrates Radarr, Sonarr, Plex, and TMDB to automatically transcode, clean up, and manage media libraries.

## Features

- **Automatic transcoding** - Transcodes media files received from Radarr/Sonarr webhooks using FFmpeg
- **Language sync** - Syncs preferred audio/subtitle languages from TMDB to Plex
- **Media cleanup** - Periodically removes outdated or orphaned media entries
- **Telegram bot** - Interactive bot for managing language preferences

## Configuration

```
PLEX_TOKEN=
PLEX_URL=
RADARR_API_KEY=
RADARR_API_URL=
SONARR_API_KEY=
SONARR_API_URL=
TELEGRAM_CHAT_ID=
TELEGRAM_TOKEN=
TMDB_API_TOKEN=
TMDB_API_URL=
```

## Deployment

### Docker Compose

```yaml
services:
  autoscan:
    build: .
    ports:
      - '3030:3030'
    env_file: .env
    volumes:
      - ./resources:/autoscan/resources
    restart: unless-stopped
```

```bash
docker compose up -d
```

### Docker

```bash
docker build -t autoscan .
docker run -d \
  --name autoscan \
  -p 3030:3030 \
  --env-file .env \
  -v ./resources:/autoscan/resources \
  --restart unless-stopped \
  autoscan
```

## Usage

### Webhooks

Configure Radarr and Sonarr to send `Download` webhooks to:

- `POST /radarr`
- `POST /sonarr`

Trigger a full library transcode manually from the Telegram bot:

- `/transcode`

### Scheduled jobs

| Job           | Schedule         | Description                    |
| ------------- | ---------------- | ------------------------------ |
| Cleanup       | Every 10 minutes | Removes orphaned media entries |
| Language Sync | Every 12 hours   | Syncs Plex languages from TMDB |
| Transcode     | Every 12 hours   | Transcodes pending media files |

## Development

Requires [Node.js](https://nodejs.org) and FFmpeg.

```bash
pnpm install      # Install dependencies
pnpm run dev      # Development with watch mode
pnpm test         # Run tests
pnpm run lint     # Lint with oxlint
pnpm run format   # Format with oxfmt
pnpm run typecheck # Type check
pnpm run build    # Bundle with tsdown
pnpm run build:sea # Build single-file executable (Node.js SEA)
```
