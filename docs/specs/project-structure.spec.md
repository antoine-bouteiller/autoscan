---
title: Project structure
status: condensed
author: Antoine Bouteiller
date: 2026-04-17
related:
  [
    docs/specs/architecture.spec.md,
    src/providers/http/http.spec.md,
    src/providers/scheduler/scheduler.spec.md,
    src/providers/telegram/telegram.spec.md,
    src/features/transcoding/transcoding.spec.md,
    src/features/language-sync/language-sync.spec.md,
    src/features/queue-cleanup/queue-cleanup.spec.md,
    src/features/dynamic-dns/dynamic-dns.spec.md,
    src/features/trakt-sync/trakt-sync.spec.md,
  ]
---

## 2. Problem Statement

Autoscan's codebase grew from a flat "layered" layout (`controllers/`, `services/`, `repositories/`, `validators/`,
`errors/`, `types/`, `providers/`) into a feature-based layout where cross-cutting code, runtime providers, shared
infrastructure, external integrations, and business-capability features each have a dedicated home. This spec pins
the layout so that contributors (human or agent) know where new code goes and when an import is a smell.

- `[G-1]` Every TypeScript file and every `*.spec.md` has exactly one correct home that follows from the rules below.
- `[G-2]` The rules are verifiable by shell scripts — a CI check could fail a PR that violates them.
- `[G-3]` Adding a new feature is a self-contained change: one folder under `src/features/`, no other file needs to
  move.
- `[G-4]` Renaming or deleting a feature cleanly deletes its folder, never leaves orphans under `src/core/`,
  `src/integrations/`, or `src/shared/`.

## 3. Key Design Decisions

| Decision                      | Choice                                                                                                                                                                         | Rationale                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Top-level grouping   | `config/`, `core/`, `database/`, `integrations/`, `media/`, `providers/`, `shared/`, `features/`                                                                               | Orthogonal concerns; each answers a different "what is this?" question                                    |
| `[KD-2]` Feature isolation    | Each feature owns everything it needs under one folder and registers itself via a `register.ts`                                                                                | A feature is independently deletable; wiring is explicit at `core/bootstrap.ts`                           |
| `[KD-3]` Feature sub-grouping | Within a feature, kind-based subfolders (`services/`, `commands/`, `jobs/`, `webhooks/`, `repositories/`, `validators/`)                                                       | Avoids a 10-file flat pile; one glance at the folder tells you what the feature exposes                   |
| `[KD-4]` Integrations layer   | `src/integrations/<vendor>/` houses thin external-API clients (HTTP/FFmpeg); validators and vendor-errors co-locate                                                            | The vendor is the unit of change; `plex/plex.{service,validator,errors}.ts` group by vendor, not by layer |
| `[KD-5]` Shared domain        | `src/media/` holds the cross-feature media metadata domain (service + errors); `src/shared/` holds utility-level primitives (including `media.repository`)                     | Keeps feature independence without drowning `shared/` in business logic                                   |
| `[KD-6]` Providers            | Core runtime hosts — HTTP, scheduler, Telegram — live under `src/providers/<name>/` with a co-located `*.spec.md` each                                                         | They are not features (they have no business logic); they are not `shared/` (they have lifecycle)         |
| `[KD-7]` Spec colocation      | Feature specs and provider specs live next to the code they document; cross-cutting specs live in `docs/specs/`                                                                | Feature-owned specs move with the feature; cross-cutting specs don't belong to any one module             |
| `[KD-8]` File naming          | `snake_case.ts` (lint-enforced); kind suffix indicates role (`*.service.ts`, `*.command.ts`, `*.job.ts`, `*.webhook.ts`, `*.validator.ts`, `*.repository.ts`, `*.provider.ts`) | The filename is a visual tag for the role; lint catches drift                                             |
| `[KD-9]` Module resolution    | Node subpath imports via `package.json` `"#*": "./src/*.js"` — every file is reachable as `#<path-under-src>`                                                                  | No relative `../../..` imports; refactors that move files only touch their import path                    |

## 4. Principles & Intents

- `[PI-1]` **Features are independent.** A file under `src/features/<A>/` must not import from `src/features/<B>/`.
  Cross-feature reuse means the shared code is promoted to `#media`, `#shared`, `#integrations`, or `#providers`.
- `[PI-2]` **Core is boring.** `src/core/` contains only the DI container and the bootstrap wiring. No business
  logic, no ambient state beyond the `container` singleton.
- `[PI-3]` **Integrations are thin, services are thick.** An integration wraps an external API with typed Zod
  results; any orchestration lives in a feature `service`.
- `[PI-4]` **Kind suffix ↔ subfolder.** `*.service.ts` lives in `services/`, `*.command.ts` in `commands/`, etc.
  The only feature-root files are `register.ts`, `errors.ts`, `types.ts`, and the spec.
- `[PI-5]` **`register.ts` is the feature's API.** `core/bootstrap.ts` imports `registerX` from each feature;
  nothing else in the feature is imported by core.
- `[PI-6]` **The spec co-locates with the code it describes.** A provider spec sits beside its provider; a feature
  spec sits inside the feature folder. Only cross-cutting specs live in `docs/specs/`.
- `[PI-7]` **Validators live with the producer of the shape**, not the consumer. The Radarr webhook validator is
  under `integrations/arr/` because Radarr _is_ the arr integration; the send-message body validator is under
  `features/send-message/` because that feature defines the shape.

## 5. Non-Goals

- `[NG-1]` No "layer" folders at the root — no `src/controllers/`, `src/services/`, `src/repositories/`. Those
  concerns exist, but only inside a feature/provider/integration folder.
- `[NG-2]` No barrel `index.ts` re-exports under `src/features/<name>/` — imports target the specific file, which
  makes dead-code elimination trivial.
- `[NG-3]` Not a monorepo — one `package.json`, one `tsconfig.json`. The feature-per-folder shape does not imply
  per-feature packages.
- `[NG-4]` No dynamic feature discovery — features are listed explicitly in `core/bootstrap.ts`. Adding a feature
  requires editing bootstrap (intentional: keeps the graph explicit and greppable).

## 6. Caveats

- `[C-1]` `src/media/` is a one-off domain folder (shared media metadata) and not a general pattern — it exists
  because three features need the same metadata logic and promoting to `shared/` would bury business logic there.
  Resist adding more domain folders without a clear multi-feature consumer.
- `[C-2]` `src/shared/media.repository.ts` is the only non-primitive under `shared/`. It's there (rather than in
  `media/` with its sibling service) because multiple features depend on raw repository queries without going through
  `metadata.service`. Revisit if the split becomes confusing.
- `[C-3]` The `send-message` feature has a single webhook and no service — it exists as a feature only because
  `POST /send-message` is an HTTP entry point that doesn't belong to any other feature. It does not get a dedicated
  `.spec.md` (documented inside `http.spec.md` §8.4).
- `[C-4]` Subpath imports (`#*`) depend on `package.json` `"imports"`. Bundlers / IDEs must honor it
  (Vite+ + tsconfig-paths does; tsx --watch does too).
- `[C-5]` Filenames use `snake_case`, folder names use `kebab-case`. This is asymmetric but matches the oxlint rule
  (`unicorn/filename-case: { cases: { snakeCase: true } }`) which applies to files only.

## 7. High-Level Components

| Top-level directory | Role                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`      | Entry: resolve providers, start HTTP + Telegram, install SIGINT handler                                                                         |
| `src/core/`         | Cross-cutting wiring (bootstrap, DI container) — not a feature                                                                                  |
| `src/config/`       | `env`, `logger`, `db` — validated / constructed once at import time                                                                             |
| `src/database/`     | Drizzle schema only (queries live in repositories)                                                                                              |
| `src/providers/`    | Core runtime providers (HTTP, scheduler, Telegram), each with a co-located spec                                                                 |
| `src/media/`        | Shared media domain (metadata.service + errors)                                                                                                 |
| `src/shared/`       | Cross-feature primitives (errors, types, utils) + `media.repository`                                                                            |
| `src/integrations/` | External API clients grouped by vendor (arr, cloudflare, ffmpeg, plex, telegram, tmdb, trakt)                                                   |
| `src/features/`     | Business capabilities, each independent with a `register.ts` (dynamic-dns, language-sync, queue-cleanup, send-message, trakt-sync, transcoding) |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Rule / layer                 | Location                                                                        | Entry point                                           |
| ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Import boundaries per layer  | Enforced across `src/`                                                          | Convention + `[VC-1]` grep check                      |
| Where new files go           | `src/<layer>/`                                                                  | Per §7 top-level inventory                            |
| File-kind naming conventions | All of `src/`                                                                   | Oxlint `unicorn/filename-case: snake_case` + `[VC-7]` |
| Spec colocation              | `src/features/*/*.spec.md`, `src/providers/*/*.spec.md`, `docs/specs/*.spec.md` | `[VC-4]`                                              |
| Feature independence         | `src/features/<f>/`                                                             | `register.ts` (only public entry) + `[VC-1]`          |
| Bootstrap wiring             | `src/core/bootstrap.ts`                                                         | Imports `registerX` from every feature — `[VC-5]`     |
| No layer folders at root     | `src/`                                                                          | `[VC-2]` shell check                                  |
| Kind-suffix ↔ subfolder      | `src/features/<f>/<kind>/*.<kind>.ts`                                           | `[VC-7]` find check                                   |

## 9. Verification Criteria

- `[VC-1]` No file under `src/features/<A>/` imports from `#features/<B>/*` for any `A ≠ B`. Verified via:
  `for f in src/features/*/; do grep -rn "from '#features/" "$f" | grep -v "from '#features/$(basename "$f")/"; done`
  must print nothing.
- `[VC-2]` No "layer" folders exist at `src/` root: none of `services/`, `controllers/`, `repositories/`,
  `validators/`, `errors/`, `types/`, `utils/`, `jobs/`.
- `[VC-3]` Every feature folder contains a `register.ts` exporting a `registerX` function.
- `[VC-4]` Every feature (except `send-message`, see `[C-3]`) and every provider has a co-located `*.spec.md`.
- `[VC-5]` `core/bootstrap.ts` imports `registerX` from every feature folder listed in §7 and invokes it once.
- `[VC-6]` Type-check + lint pass: `vp check` (includes `unicorn/filename-case: snake_case` rule).
- `[VC-7]` Inside `src/features/`, every `*.service.ts` lives under a `services/` subfolder; every `*.command.ts`
  under `commands/`; every `*.job.ts` under `jobs/`; every `*.webhook.ts` under `webhooks/`; every `*.repository.ts`
  under `repositories/`; every `*.validator.ts` under `validators/`. Outside features, the `*.service.ts` suffix
  carries a different meaning (external-API clients under `src/integrations/<vendor>/`, the media domain's
  `metadata.service.ts` under `src/media/`) and is not subject to the subfolder rule. Every `*.provider.ts` lives
  under `src/providers/<name>/`. Verified via:
  `find src/features -name "*.service.ts" -not -path "*/services/*"` (and analogous for other suffixes) must print
  nothing.

## 10. Open Questions

N/A
