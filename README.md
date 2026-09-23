<div align="center">

<img src=".github/logo.svg" width="128" alt="Autoscan logo">

# Autoscan

<p align="center">
  <a href="https://github.com/antoine-bouteiller/autoscan/actions/workflows/quality-checks.yaml"><img alt="Quality Checks" src="https://img.shields.io/github/actions/workflow/status/antoine-bouteiller/autoscan/quality-checks.yaml?style=for-the-badge&branch=main&label=quality%20checks&logo=github"></a>
  <a href="https://codecov.io/github/antoine-bouteiller/autoscan"><img alt="Codecov" src="https://img.shields.io/codecov/c/github/antoine-bouteiller/autoscan?style=for-the-badge&token=O2HLEE8XOI&logo=codecov"></a>
  <a href="https://github.com/antoine-bouteiller/autoscan/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/antoine-bouteiller/autoscan?style=for-the-badge&logo=git&logoColor=white"></a>
</p>

</div>

Media automation for Radarr, Sonarr, Plex, TMDB, and Bazarr, built with Bun and Effect.

## Features

- **Transcoding** — FFmpeg processing from download webhooks or Plex library scans.
- **Language sync** — Selects Plex audio/subtitles using TMDB metadata and per-title preferences.
- **Queue cleanup** — Removes and blocklists stalled or unimportable Radarr/Sonarr downloads.
- **Subtitle maintenance** — Independently checks external SRT timing against the selected audio's speech activity, requests fixes through Bazarr, manages French forced-subtitle profiles, and handles overdue missing subtitles.
- **Telegram control** — Plex authentication, language preferences, manual scans, and notifications.

## Setup

Requires Bun 1.4.2, FFmpeg, PostgreSQL, and access to the services above. Create a PostgreSQL database and a `.env` file in the repository root:

```dotenv
BAZARR_API_URL=http://localhost:6767
BAZARR_API_KEY=
BAZARR_FRENCH_PROFILE=French forced
PLEX_URL=http://localhost:32400
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=autoscan
POSTGRES_USERNAME=autoscan
POSTGRES_PASSWORD=
RADARR_API_URL=http://localhost:7878
RADARR_API_KEY=
SONARR_API_URL=http://localhost:8989
SONARR_API_KEY=
TELEGRAM_CHAT_ID=
TELEGRAM_TOKEN=
TMDB_API_URL=https://api.themoviedb.org/3
TMDB_API_TOKEN=
TRANSCODE_PATH=/path/to/transcode
```

- Replace example URLs and fill in credentials. `POSTGRES_PASSWORD` is optional when database authentication does not require it.
- Bazarr, Radarr, and Sonarr API keys, Telegram chat ID/token, and the TMDB token support a corresponding `*_FILE` variable instead.
- `BAZARR_API_URL` is the root URL, without `/api`. `BAZARR_FRENCH_PROFILE` must name a profile requesting only French forced subtitles; profile changes apply to movies, not series.
- Use identical media paths across Autoscan, Plex, Radarr/Sonarr, and Bazarr. Autoscan needs writable media and transcoding directories.

```bash
bun install
bun run start
```

Bun loads `.env` automatically. Database migrations run at startup. Send `/plex` to the Telegram bot and follow the authorization link before using Plex-dependent features.

For Nix, run `nix build`; the flake also exports a [NixOS module](flake.nix) under `nixosModules.default` with `services.autoscan` options.

## Usage

The HTTP server listens on port **3030**. Keep it on a trusted network or behind an authenticated proxy; its routes have no built-in authentication.

- Configure Radarr/Sonarr `Download` webhooks at `POST /radarr` and `POST /sonarr`.
- Send notifications to Telegram with `POST /send_message` and JSON `{"text":"Hello"}`.

Telegram commands:

- `/plex` — Link the Plex account; credentials persist in PostgreSQL.
- `/setlanguage` — Set a movie or series language preference.
- `/transcode` — Start a full-library transcode scan.
- `/subtitlescan` — Start an incremental subtitle pass; overlapping passes are skipped.

Scheduled jobs:

| Job            | Schedule         |
| -------------- | ---------------- |
| Queue cleanup  | Every 10 minutes |
| Language sync  | Every 12 hours   |
| Transcode scan | Every 12 hours   |
| Subtitle scan  | Daily at 05:00   |

Subtitle analysis is capped at 10 eligible media per pass; current-version terminal verdicts (including inconclusive checks) are skipped, while pending syncs are rechecked once. Missing-subtitle handling remains library-wide. When candidates survive the forced-subtitle check, the media's selected audio is decoded once per pass and reused to check those sidecars independently, including a lone subtitle. Speech detection uses Silero VAD with Microsoft's ONNX Runtime WASM on a single CPU thread. The pinned model and runtime are embedded in the Bun executable: no Python, GPU, account, or runtime download is required. This checks timing, not whether the words match the dialogue; uncertain evidence causes no sync or passing verdict, only a one-time Telegram alert for manual review. The Bazarr adapter targets 1.4.0: verify lookup, wanted lists, subtitle actions, and profile changes on a disposable library before deployment. See the [subtitle scan spec](src/features/subtitle_scan/subtitle_scan.spec.md) for policies and limits.

## Development

Tests require Docker for the PostgreSQL testcontainer and FFmpeg.

```bash
bun run dev                  # Watch mode
bun run test                 # Application and lint-rule tests
bun run fmt                  # Format
bun run lint                 # Auto-fix lint findings and check types
```

`bun install` regenerates `bun.nix` via bun2nix; commit it with `bun.lock` when dependencies change. See [project structure](docs/project_structure.spec.md) and feature-local specs under `src/features/` for implementation details.
