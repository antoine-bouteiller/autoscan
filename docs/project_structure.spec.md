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
    src/domains/media/media.spec.md,
    src/features/transcoding/transcoding.spec.md,
    src/features/language_sync/language_sync.spec.md,
    src/features/queue_cleanup/queue_cleanup.spec.md,
    src/features/dynamic_dns/dynamic_dns.spec.md,
    src/features/trakt_sync/trakt_sync.spec.md,
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
  `src/integrations/`, `src/shared/`, or `src/domains/`.

## 3. Key Design Decisions

| Decision                      | Choice                                                                                                                                                                                                                                                                         | Rationale                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Top-level grouping   | `config/`, `core/`, `database/`, `domains/`, `features/`, `integrations/`, `providers/`, `shared/`                                                                                                                                                                             | Orthogonal concerns; each answers a different "what is this?" question                                    |
| `[KD-2]` Feature isolation    | Each feature owns everything it needs under one folder and registers itself via a `register.ts`                                                                                                                                                                                | A feature is independently deletable; wiring is explicit at `core/bootstrap.ts`                           |
| `[KD-3]` Feature sub-grouping | Within a feature, kind-based subfolders (`services/`, `commands/`, `jobs/`, `webhooks/`, `repositories/`, `validators/`)                                                                                                                                                       | Avoids a 10-file flat pile; one glance at the folder tells you what the feature exposes                   |
| `[KD-4]` Integrations layer   | `src/integrations/<vendor>/` houses thin external-API clients (HTTP/FFmpeg); validators and vendor-errors co-locate                                                                                                                                                            | The vendor is the unit of change; `plex/plex.{service,validator,errors}.ts` group by vendor, not by layer |
| `[KD-5]` Domains layer        | `src/domains/<name>/` holds cross-feature business domains (services, repositories, errors, types); same kind-subfolder rule as features; no `register.ts`; co-located `*.spec.md`. First inhabitant: `media/`                                                                 | Promotes the pattern from one-off to named; `shared/` stays utility-only                                  |
| `[KD-6]` Providers            | Core runtime hosts — HTTP, scheduler, Telegram — live under `src/providers/<name>/` with a co-located `*.spec.md` each                                                                                                                                                         | They are not features (they have no business logic); they are not `shared/` (they have lifecycle)         |
| `[KD-7]` Spec colocation      | Feature, provider, and domain specs live next to the code they document; cross-cutting specs live in `docs/specs/`                                                                                                                                                             | Module-owned specs move with the module; cross-cutting specs don't belong to any one module               |
| `[KD-8]` Naming convention    | `snake_case` for both files and folders (lint-enforced for files via `unicorn/filename-case`, convention + CI grep for folders); kind suffix indicates role (`*.service.ts`, `*.command.ts`, `*.job.ts`, `*.webhook.ts`, `*.validator.ts`, `*.repository.ts`, `*.provider.ts`) | Single uniform convention; the filename is a visual tag for the role; lint catches file drift             |
| `[KD-9]` Module resolution    | Node subpath imports via `package.json` `"#*": "./src/*.js"` — every file is reachable as `#<path-under-src>`                                                                                                                                                                  | No relative `../../..` imports; refactors that move files only touch their import path                    |

## 4. Principles & Intents

- `[PI-1]` **Features are independent.** A file under `src/features/<A>/` must not import from `src/features/<B>/`.
  Cross-feature reuse means the shared code is promoted to `#domains`, `#shared`, `#integrations`, or `#providers`.
- `[PI-2]` **Core is boring.** `src/core/` contains only the DI container and the bootstrap wiring. No business
  logic, no ambient state beyond the `container` singleton.
- `[PI-3]` **Integrations are thin, services are thick.** An integration wraps an external API with typed Zod
  results; any orchestration lives in a feature `service`.
- `[PI-4]` **Kind suffix ↔ subfolder.** `*.service.ts` lives in `services/`, `*.command.ts` in `commands/`, etc.
  The only feature-root files are `register.ts`, `errors.ts`, `types.ts`, and the spec.
- `[PI-5]` **`register.ts` is the feature's API.** `core/bootstrap.ts` imports `registerX` from each feature;
  nothing else in the feature is imported by core.
- `[PI-6]` **The spec co-locates with the code it describes.** A provider spec sits beside its provider; a feature
  spec sits inside the feature folder; a domain spec sits inside the domain folder. Only cross-cutting specs live in
  `docs/specs/`.
- `[PI-7]` **Validators live with the producer of the shape**, not the consumer. The Radarr webhook validator is
  under `integrations/arr/` because Radarr _is_ the arr integration; the send_message body validator is under
  `features/send_message/` because that feature defines the shape.
- `[PI-8]` **Domains are independent.** A file under `src/domains/<A>/` must not import from `src/domains/<B>/`.
  Domains may depend on `#shared`, `#config`, `#database`, and `#integrations` — never on `#features`, `#providers`,
  or sibling domains. If two domains need the same code, promote it to `#shared` or `#integrations`.
- `[PI-9]` **Domain folders earn their place.** Create `src/domains/<x>/` only when the code is reused across 3+
  features (or 2 features + 1 provider/integration). Until that threshold is reached, the code stays with its
  originator. This prevents speculative domains and keeps the top level meaningful.
- `[PI-10]` **Tests mirror `src/`.** For every `src/<path>/<name>.<kind>.ts` with a test, the test lives at
  `tests/<path>/<name>.spec.ts`. Shared test infrastructure (`setup.ts`, `env.ts`, `utils.ts`, `mocks/`, `resources/`)
  stays at the `tests/` root because it cuts across every test. No "layer" folders under `tests/`
  (e.g., no `tests/services/`, `tests/routes/`, `tests/repositories/`) — tests follow the feature/domain/shared
  structure, same as `src/`.

## 5. Non-Goals

- `[NG-1]` No "layer" folders at the root — no `src/controllers/`, `src/services/`, `src/repositories/`. Those
  concerns exist, but only inside a feature/provider/integration/domain folder.
- `[NG-2]` No barrel `index.ts` re-exports under `src/features/<name>/` — imports target the specific file, which
  makes dead-code elimination trivial.
- `[NG-3]` Not a monorepo — one `package.json`, one `tsconfig.json`. The feature-per-folder shape does not imply
  per-feature packages.
- `[NG-4]` No dynamic feature discovery — features are listed explicitly in `core/bootstrap.ts`. Adding a feature
  requires editing bootstrap (intentional: keeps the graph explicit and greppable).

## 6. Caveats

- `[C-4]` Subpath imports (`#*`) depend on `package.json` `"imports"`. Bundlers / IDEs must honor it
  (Vite+ + tsconfig-paths does; tsx --watch does too).

## 7. High-Level Components

| Top-level directory | Role                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`      | Entry: resolve providers, start HTTP + Telegram, install SIGINT handler                                                                         |
| `src/core/`         | Cross-cutting wiring (bootstrap, DI container) — not a feature                                                                                  |
| `src/config/`       | `env`, `logger`, `db` — validated / constructed once at import time                                                                             |
| `src/database/`     | Drizzle schema only (queries live in repositories)                                                                                              |
| `src/providers/`    | Core runtime providers (HTTP, scheduler, Telegram), each with a co-located spec                                                                 |
| `src/domains/`      | Cross-feature business domains, each independent with kind-subfolders and a co-located spec (currently: `media/`)                               |
| `src/shared/`       | Cross-feature primitives only (errors, types, utils) — no business logic                                                                        |
| `src/integrations/` | External API clients grouped by vendor (arr, cloudflare, ffmpeg, plex, telegram, tmdb, trakt)                                                   |
| `src/features/`     | Business capabilities, each independent with a `register.ts` (dynamic_dns, language_sync, queue_cleanup, send_message, trakt_sync, transcoding) |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Rule / layer                 | Location                                                                                                   | Entry point                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Import boundaries per layer  | Enforced across `src/`                                                                                     | Convention + `[VC-1]`, `[VC-8]` grep checks           |
| Where new files go           | `src/<layer>/`                                                                                             | Per §7 top-level inventory                            |
| File-kind naming conventions | All of `src/`                                                                                              | Oxlint `unicorn/filename-case: snake_case` + `[VC-7]` |
| Spec colocation              | `src/features/*/*.spec.md`, `src/providers/*/*.spec.md`, `src/domains/*/*.spec.md`, `docs/specs/*.spec.md` | `[VC-4]`                                              |
| Feature independence         | `src/features/<f>/`                                                                                        | `register.ts` (only public entry) + `[VC-1]`          |
| Domain independence          | `src/domains/<d>/`                                                                                         | No `register.ts`; passive exports + `[VC-8]`          |
| Bootstrap wiring             | `src/core/bootstrap.ts`                                                                                    | Imports `registerX` from every feature — `[VC-5]`     |
| No layer folders at root     | `src/`                                                                                                     | `[VC-2]` shell check                                  |
| Kind-suffix ↔ subfolder      | `src/features/<f>/<kind>/*.<kind>.ts`, `src/domains/<d>/<kind>/*.<kind>.ts`                                | `[VC-7]` find check                                   |

## 9. Verification Criteria

- `[VC-1]` No file under `src/features/<A>/` imports from `#features/<B>/*` for any `A ≠ B`. Verified via:
  `for f in src/features/*/; do grep -rn "from '#features/" "$f" | grep -v "from '#features/$(basename "$f")/"; done`
  must print nothing.
- `[VC-2]` No "layer" folders exist at `src/` root: none of `services/`, `controllers/`, `repositories/`,
  `validators/`, `errors/`, `types/`, `utils/`, `jobs/`.
- `[VC-3]` Every feature folder contains a `register.ts` exporting a `registerX` function.
- `[VC-4]` Every feature, every provider, and every domain has a co-located `*.spec.md`.
- `[VC-5]` `core/bootstrap.ts` imports `registerX` from every feature folder listed in §7 and invokes it once.
- `[VC-6]` Type-check + lint pass: `vp check` (includes `unicorn/filename-case: snake_case` rule for files). Folder
  naming is verified separately via `[VC-9]`.
- `[VC-7]` Inside `src/features/` and `src/domains/`, every `*.service.ts` lives under a `services/` subfolder; every
  `*.command.ts` under `commands/`; every `*.job.ts` under `jobs/`; every `*.webhook.ts` under `webhooks/`; every
  `*.repository.ts` under `repositories/`; every `*.validator.ts` under `validators/`. Outside features and domains,
  the `*.service.ts` suffix carries a different meaning (external-API clients under `src/integrations/<vendor>/`) and
  is not subject to the subfolder rule. Every `*.provider.ts` lives under `src/providers/<name>/`. Verified via:
  `find src/features src/domains -name "*.service.ts" -not -path "*/services/*"` (and analogous for other suffixes)
  must print nothing.
- `[VC-8]` No file under `src/domains/<A>/` imports from `#domains/<B>/*` for any `A ≠ B`, and no file under
  `src/domains/` imports from `#features/*` or `#providers/*`. Verified via:
  `for d in src/domains/*/; do grep -rn "from '#domains/" "$d" | grep -v "from '#domains/$(basename "$d")/"; done`
  and `grep -rn "from '#\(features\|providers\)/" src/domains/` must both print nothing.
- `[VC-9]` All folders under `src/` and `tests/` use `snake_case`. Verified via:
  `find src tests -type d | grep -E '/[^/]*(-|[A-Z])[^/]*/?$'` must print nothing.
- `[VC-10]` Under `tests/`, there are no layer folders (`services/`, `routes/`, `controllers/`, `repositories/`,
  `utils/`, `jobs/`, `webhooks/` directly at the `tests/` root). Verified via:
  `for d in services routes controllers repositories utils jobs webhooks; do test ! -e "tests/$d"; done`.

## 10. Open Questions

N/A

## Changelog

| Date       | Amendment                                | Sections affected                                                                                                                        | Reason                                                                                                                                                                                    |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-17 | Introduce `src/domains/` plural layer    | §2 [G-4], §3 [KD-1, KD-5, KD-7], §4 [PI-1, PI-6, PI-8, PI-9], §5 [NG-1], §6 [C-1, C-2 removed; C-6 added], §7, §8, §9 [VC-4, VC-7, VC-8] | Promote `src/media/` from a one-off to a named pattern; consolidate `src/shared/media.repository.ts` into the domain; enforce domain independence symmetrically with feature independence |
| 2026-04-17 | Uniform `snake_case` + send_message spec | §3 [KD-8], §6 [C-3, C-5, C-6 removed], §9 [VC-4, VC-6, VC-9]                                                                             | Drop the kebab-case-for-folders exception (now snake_case everywhere) and drop the send_message spec exemption (now every feature has a spec)                                             |
| 2026-04-17 | Tests mirror `src/` layout               | §4 [PI-10], §9 [VC-10]                                                                                                                   | Replace layer-based `tests/{services,routes,repositories,utils}/` with a parallel tree under `tests/features/`, `tests/shared/`, `tests/media/` — tests follow the same shape as `src/`   |
| 2026-04-17 | Verification complete                    | 1 (status)                                                                                                                               | All [VC-1] through [VC-10] pass against the implemented `src/domains/media/` move + tests restructure; status promoted to `implemented`                                                   |
| 2026-04-17 | Re-condensed                             | 1 (status)                                                                                                                               | Post-verification condensation — §7/§8 were already in pointer form from prior condensation, so only status flipped back                                                                  |
