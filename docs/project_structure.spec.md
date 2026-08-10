---
title: Project Structure
version: 1.1
date_created: 2026-05-08
last_updated: 2026-08-06
tags: [architecture, structure, conventions]
---

# Introduction

This specification defines the canonical folder layout, file naming conventions, and inter-module
boundaries of the Autoscan codebase. It exists to keep the structure predictable as features are
added, and to make cross-cutting concerns (DI, providers, integrations) impossible to confuse with
feature-local logic.

## 1. Purpose & Scope

Applies to every TypeScript source and test file under the single Autoscan package. Covers the
top-level layout under `src/`, suffix conventions, the `@/*` import alias, the test mirror under
`tests/`, and the rules that govern cross-feature reuse. Out of scope: runtime behaviour of any
specific feature, container internals, and the feature registration lifecycle (each documented in
its own spec).

## 2. Definitions

- **Feature**: a self-contained business capability under `src/features/<name>/`, wired through a
  single `feature.ts` declaration.
- **Domain**: cross-feature business module under `src/domains/<name>/` (services, repositories).
- **Integration**: thin, Effect Schema-validated client to one external vendor under
  `src/integrations/<vendor>/`.
- **Provider**: long-lived runtime host with a lifecycle (HTTP server, scheduler, Telegram bot)
  under `src/providers/<name>/`.
- **Kind suffix**: the dot-segment in a filename indicating its role (e.g. `.service.ts`,
  `.job.ts`).
- **Subpath import**: a path alias for `src/`. This project uses `@/*` -> `./src/*`, resolved by
  Bun via the `paths` entry in `tsconfig.json` (mirrored by `package.json#imports`).

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Top-level `src/` directories MUST be exactly: `config/`, `core/`, `database/`,
  `domains/`, `features/`, `integrations/`, `providers/`, `shared/`.
- **REQ-002** Files and folders MUST use `snake_case`; `unicorn/filename-case` enforces this.
- **REQ-003** Source files MUST use one of the kind suffixes: `.service.ts`, `.command.ts`,
  `.job.ts`, `.webhook.ts`, `.validator.ts`, `.repository.ts`, `.provider.ts`, `.errors.ts`.
- **REQ-004** Within a feature or domain, files of a given kind MUST live in the matching
  subfolder (`services/`, `commands/`, `jobs/`, `webhooks/`, `validators/`, `repositories/`).
- **REQ-005** Allowed root files inside `src/features/<feature>/` are limited to `feature.ts`,
  `errors.ts`, `types.ts`, and `<feature>.spec.md`.
- **REQ-006** Every feature MUST be exported from `src/features/index.ts` as a `<name>Feature`
  binding and listed in the `features` array.
- **REQ-007** Internal imports MUST use the `@/*` alias resolving to `src/`. Relative parent
  imports (`../`) MUST NOT cross a top-level boundary.
- **REQ-008** Tests MUST mirror `src/` under `tests/`: a source file `src/<path>/<name>.<kind>.ts`
  has its test at `tests/<path>/<name>.spec.ts`.
- **CON-001** A feature MUST NOT import from a sibling feature (`@/features/a` from
  `@/features/b`). Shared logic MUST be promoted to `domains/`, `shared/`, `integrations/`, or
  `providers/`.
- **CON-002** `src/core/` MUST contain only DI plumbing and bootstrap wiring. No business logic,
  no integration calls, no scheduling.
- **CON-003** `src/integrations/<vendor>/` MUST stay thin: typed HTTP/CLI wrappers with Effect
  Schema validators only. Multi-vendor orchestration belongs in feature services.
- **CON-004** Feature folders MUST NOT contain barrel `index.ts` re-exports. Each consumer imports
  the specific module it needs.
- **CON-005** `src/features/index.ts` MUST list features explicitly. Dynamic discovery (filesystem
  globbing, decorators, side-effect imports) is forbidden.
- **CON-006** This is not a monorepo: there is exactly one `package.json` and one `tsconfig.json`
  at the repo root.
- **GUD-001** Promote code to `src/domains/<x>/` only when reused across 3+ features, or 2
  features plus 1 provider/integration. Below that threshold, keep it feature-local.
- **GUD-002** Place an Effect Schema validator next to the producer of the shape: webhook payload validators
  under `integrations/`, request body validators under the feature exposing the route.
- **GUD-003** Co-locate the spec with the code it describes: `src/<path>/<name>.spec.md` for
  features/providers/domains; cross-cutting specs under `docs/`.
- **GUD-004** Keep feature roots flat: prefer one subfolder per kind over deep nesting.
- **PAT-001** Wiring pattern: `feature.ts` calls `defineFeature({...})` and exposes `routes`,
  `jobs`, `commands`, `conversations`. `core/bootstrap.ts` runs `registerFeatures(features)` once
  at startup.
- **PAT-002** DI pattern: shared dependencies use `Context.Service` keys from
  `core/runtime.service.ts`; production and tests provide explicit Effect layers at composition boundaries.

## 4. Interfaces & Data Contracts

| Folder              | Role                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/config/`       | Env loader (Effect Schema), logger, database init (Postgres / PGlite + Drizzle migrations)                                 |
| `src/core/`         | Effect services/layers, bootstrap, lifecycle, and feature registration helpers                                             |
| `src/database/`     | Drizzle schema (e.g. `media`, `traktTokens`, `traktSyncHistory`)                                                           |
| `src/domains/`      | Cross-feature business modules (services, repositories)                                                                    |
| `src/features/`     | Business capabilities, one folder per feature, each owning its `feature.ts`                                                |
| `src/integrations/` | Thin per-vendor clients with Effect Schema validators (`arr`, `cloudflare`, `ffmpeg`, `plex`, `telegram`, `tmdb`, `trakt`) |
| `src/providers/`    | Runtime hosts with lifecycle (`http`, `scheduler`, `telegram`)                                                             |
| `src/shared/`       | Shared utilities and types with typed I/O boundaries                                                                       |

| Kind suffix      | Subfolder          | Purpose                                        |
| ---------------- | ------------------ | ---------------------------------------------- |
| `.service.ts`    | `services/`        | Stateful or stateless orchestration logic      |
| `.command.ts`    | `commands/`        | Telegram command handler                       |
| `.job.ts`        | `jobs/`            | Cron job handler registered with scheduler     |
| `.webhook.ts`    | `webhooks/`        | HTTP webhook handler                           |
| `.validator.ts`  | `validators/`      | Effect Schema for an external or request shape |
| `.repository.ts` | `repositories/`    | Database access (Drizzle)                      |
| `.provider.ts`   | (root)             | Runtime host class implementing a lifecycle    |
| `.errors.ts`     | (root or per kind) | Typed error classes                            |

Import alias: `@/*` resolves to `./src/*.js` (Node subpath imports). Imports MUST use the `.js`
extension, e.g. `import { foo } from '@/shared/utils/array.js'`.

## 5. Acceptance Criteria

- **AC-001** Given a new feature `foo`, when its files are placed under `src/features/foo/` with
  `feature.ts` and any subfolders for `services/`, `jobs/`, etc., then `bun run lint` passes and
  `src/features/index.ts` exports `fooFeature` in the `features` array.
- **AC-002** Given a source file `src/features/foo/services/foo.service.ts`, when its test is
  placed at `tests/features/foo/services/foo.spec.ts`, then `bun run test` discovers and runs it.
- **AC-003** Given an attempt to add `import { x } from '@/features/bar/services/bar.service.js'`
  inside `src/features/foo/`, when the import is reviewed, then the change is rejected and the
  shared logic is promoted to `domains/`, `shared/`, `integrations/`, or `providers/`.
- **AC-004** Given a file named `Foo.Service.ts` or `foo-service.ts`, when `bun run lint` runs, then
  `unicorn/filename-case` reports an error.
- **AC-005** Given a relative import `../../features/...` crossing a top-level boundary, when
  reviewed, then the change is rejected in favour of the `@/` alias.

## 6. Test Automation Strategy

- Tests live under `tests/` and mirror `src/` one-for-one; there are no `unit/`, `integration/`, tooling-contract, or other layer folders.
- Shared test infrastructure (`preload.ts`, `setup.ts`, `utils.ts`, `mocks/`, `resources/`) lives at
  the `tests/` root. Test helpers are imported via the `@tests/*` alias, not relative paths.
- The runner is Bun's native `bun test` (config in `bunfig.toml`) via `bun run test` (one-shot),
  `bun run test:watch` (watch mode), and `bun run test:coverage` (coverage + global gate).
- CI's non-mutating formatting, linting, and TypeScript checks MUST pass on every change. `bun run lint` and `bun run fmt` are explicit repair commands. Filename casing, import boundaries, and unused-export pruning (knip) are enforced by tooling, not by review.

## 7. Rationale & Context

The split between `features/`, `domains/`, `integrations/`, and `providers/` keeps churn local:
adding a feature touches one folder and one line in `src/features/index.ts`. Banning sibling
imports across features prevents implicit coupling that would later block extraction or removal.
Thin integrations stop vendor-specific quirks from leaking into business logic. The single-package
layout matches Autoscan's deployment shape (one service, one binary) and avoids monorepo overhead
that would not pay back at this size. Co-locating specs with code keeps the documentation reachable
from the file being changed; cross-cutting specs sit in `docs/` because they describe the seams
between modules rather than any single module.

## 8. Dependencies & External Integrations

### Technology Platform Dependencies

- **PLT-001** Bun runtime and package manager with native ESM and subpath imports (`@/*` -> `./src/*`).
- **PLT-002** oxlint and oxfmt for lint and format, invoked directly via `bun run lint` / `bun run fmt`; tests
  run on Bun's native `bun test`. Bun runs the app and manages dependencies, and Nix packaging uses bun2nix.
- **PLT-003** TypeScript with strict mode; Effect Schema for runtime validation at every external boundary.
- **PLT-004** Drizzle ORM for schema and queries.

### Infrastructure Dependencies

- **INF-001** Postgres in production, PGlite (in-process) in development and tests; both initialised
  through `src/config/` and migrated via Drizzle.
- **INF-002** External services consumed through `src/integrations/`: Radarr, Sonarr, Plex, TMDB,
  Trakt, Cloudflare DNS, Telegram, FFmpeg.

## 9. Examples & Edge Cases

Example feature tree:

```
src/features/transcoding/
  feature.ts
  errors.ts
  types.ts
  transcoding.spec.md
  services/
    transcoding.service.ts
  jobs/
    scan_library.job.ts
  webhooks/
    radarr.webhook.ts
  validators/
    transcoding_request.validator.ts
```

Forbidden cross-feature import:

```ts
// src/features/transcoding/services/transcoding.service.ts
import { syncLanguages } from '@/features/language_sync/services/language_sync.service.js' // CON-001 violation
```

Allowed promotion path: extract the shared helper to `src/domains/media/services/media.service.ts`
(if it concerns the media domain) or to `src/shared/utils/<x>.ts` (if it is a pure utility), then
import from there in both features.

## 10. Validation Criteria

- `find src -maxdepth 1 -type d` returns only the eight directories listed in REQ-001.
- `bun run lint` passes (`unicorn/filename-case`, import boundary rules, no unused exports).
- `bunx oxfmt --check .`, `bunx oxlint`, and `bunx tsc --noEmit` pass.
- `grep -RInE "from '@/features/[^']+'" src/features/<a>/` returns no hits referencing a sibling
  feature `<b>`.
- `grep -RInE "from '\\.\\./\\.\\./" src` returns no hits crossing a top-level boundary.
- `grep -RInE "^export \\* from" src/features/` returns no hits (no barrels).
- Every feature folder has a corresponding `<feature>Feature` import in `src/features/index.ts`.

## 11. Related Specifications / Further Reading

- docs/architecture/container.spec.md
- docs/architecture/feature_registration.spec.md
- src/providers/http/http.spec.md
- src/providers/scheduler/scheduler.spec.md
- src/providers/telegram/telegram.spec.md
- src/domains/media/media.spec.md
- src/features/dynamic_dns/dynamic_dns.spec.md
- src/features/language_sync/language_sync.spec.md
- src/features/queue_cleanup/queue_cleanup.spec.md
- src/features/send_message/send_message.spec.md
- src/features/trakt_sync/trakt_sync.spec.md
- src/features/transcoding/transcoding.spec.md
