# Specs

Retro-specs of Autoscan's implemented features, written in the `*.spec.md` convention (see `~/.claude/rules/spec.md`).

## Core

- [architecture](./architecture.spec.md) — process model, DI container, feature-register pattern, env, error model.
- [project-structure](./project-structure.spec.md) — directory layout, import rules, where-does-it-go.
- [persistence](./persistence.spec.md) — Drizzle schema, dual-backend (Postgres/PGlite) init, repositories.

### Providers (co-located with code)

- [http](../../src/providers/http/http.spec.md) — core `HttpProvider` over `node:http`; routes are owned by features.
- [scheduler](../../src/providers/scheduler/scheduler.spec.md) — core `SchedulerProvider` over `croner`; cron jobs
  are owned by features.
- [telegram](../../src/providers/telegram/telegram.spec.md) — core long-poll bot + command/conversation dispatch;
  commands are owned by features.

## Features

Each feature is independent: it imports only from `#core`, `#config`, `#database`, `#media`, `#shared`,
`#integrations`, `#providers`, never from another feature. Each exposes a `register*()` function that wires itself to
the core providers.

Feature specs are co-located with the feature they document:

- [transcoding](../../src/features/transcoding/transcoding.spec.md) — FFmpeg probe + stream selection + single-queue
  transcoder. Owns `POST /radarr`, `POST /sonarr`, cron `Transcode` (12h), `/transcode`, `/subtitlescan`.
- [language-sync](../../src/features/language-sync/language-sync.spec.md) — TMDB-seeded preferred language per media +
  Plex reconciliation + operator override. Owns cron `Language Sync` (12h) and `/setlanguage` conversation.
- [queue-cleanup](../../src/features/queue-cleanup/queue-cleanup.spec.md) — stalled-download cleanup across
  Radarr/Sonarr queues. Owns cron `Cleanup` (10-min).
- [dynamic-dns](../../src/features/dynamic-dns/dynamic-dns.spec.md) — Cloudflare A-record reconciliation. Owns cron
  `Dynamic DNS` (5-min).
- [trakt-sync](../../src/features/trakt-sync/trakt-sync.spec.md) — Plex → Trakt watched history sync with device-code
  auth. Owns cron `Trakt Sync` (12h), `/trakt`, `/synctrakt`.
- send-message — single `POST /send-message` webhook that relays text to the Telegram chat; no dedicated spec
  (trivial — see [http](../../src/providers/http/http.spec.md) §8.4).
