<div align="center">

<img src=".github/logo.svg" width="128" alt="Autoscan logo">

# Autoscan

<p align="center">
  <a href="https://github.com/antoine-bouteiller/autoscan/actions/workflows/quality-checks.yaml"><img alt="Quality Checks" src="https://img.shields.io/github/actions/workflow/status/antoine-bouteiller/autoscan/quality-checks.yaml?style=for-the-badge&branch=main&label=quality%20checks&logo=github"></a>
  <a href="https://codecov.io/github/antoine-bouteiller/autoscan"><img alt="Codecov" src="https://img.shields.io/codecov/c/github/antoine-bouteiller/autoscan?style=for-the-badge&token=O2HLEE8XOI&logo=codecov"></a>
  <a href="https://github.com/antoine-bouteiller/autoscan/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/antoine-bouteiller/autoscan?style=for-the-badge&logo=git&logoColor=white"></a>
</p>

</div>

Media automation service that integrates Radarr, Sonarr, Plex, and TMDB to automatically transcode, clean up, and manage media libraries.

## Features

- **Automatic transcoding** - Transcodes media files received from Radarr/Sonarr webhooks using FFmpeg
- **Language sync** - Syncs preferred audio/subtitle languages from TMDB to Plex
- **Media cleanup** - Periodically removes outdated or orphaned media entries
- **Telegram bot** - Interactive bot for managing language preferences

## Configuration

```
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

Requires [Bun](https://bun.sh) and FFmpeg. Everything runs through Bun. The asynchronous runtime targets pinned Effect v4 beta packages; oxlint is patched by Effect TSGO to enforce Effect requirements, errors, and lifecycle usage. Formatting uses oxfmt directly.

```bash
bun install       # Install dependencies
bun run dev       # Development with watch mode (Bun)
bun run test      # Run tests
bun run lint      # Repair lint findings with oxlint
bun run fmt       # Repair formatting with oxfmt
```

The application runs on Bun (`bun src/index.ts`). The Nix package is built with
[bun2nix](https://github.com/nix-community/bun2nix); the `bun.nix` dependency
manifest is regenerated from `bun.lock` on every `bun install` via the
`postinstall` script.

```bash
nix build         # Build the bun2nix package
```
