---
title: Composition Container
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
parent-spec: docs/architecture/architecture.spec.md
related: [docs/project_structure.spec.md]
---

## 2. Problem Statement

N/A — goals are owned by `docs/architecture/architecture.spec.md`.

## 3. Key Design Decisions

| Decision                       | Choice                                                                                                                                  | Rationale                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Service graph         | The bootstrap module builds client, database, workflow, callback-runtime, and provider layers as an explicit graph.                     | Layer dependencies encode acquisition order and make the production composition root auditable (`src/core/bootstrap.ts:45`).                          |
| `[KD-2]` Resource acquisition  | The database resource acquires SQL with `Effect.acquireRelease` before constructing and migrating Drizzle.                              | The registered finalizer closes SQL even when construction or migration fails (`src/config/db.ts:31`).                                                |
| `[KD-3]` Provider construction | HTTP, scheduler, and Telegram providers are provided as distinct services; scheduler construction receives the callback runtime runner. | Transport providers retain their specific contracts while scheduled callbacks run in the scoped application environment (`src/core/bootstrap.ts:71`). |

## 4. Principles & Intents

- `[PI-1]` Explicit production composition — refines umbrella `[PI-1]`: the bootstrap module is the sole owner of production layer assembly.

## 5. Non-Goals

- `[NG-1]` Per-feature composition roots — refines umbrella `[NG-2]`: features do not construct runtimes or resolve dependencies globally.

## 6. Caveats

- `[C-1]` Client configuration depends on eagerly decoded environment values, including external-service credentials and URLs (`src/core/bootstrap.ts:45`).
- `[C-2]` The HTTP provider is configured for port 3030 by the composition root (`src/core/bootstrap.ts:71`).

## 7. High-Level Components

| Component       | Module type    | Responsibility                                              | Public API surface                     |
| --------------- | -------------- | ----------------------------------------------------------- | -------------------------------------- |
| Bootstrap       | Effect program | Assemble layers, start providers, and attach finalization   | `program`, `shutdownRuntime`           |
| Database layer  | Effect layer   | Acquire, migrate, expose, and release SQL/Drizzle resources | `DatabaseLive`, `makeDatabaseResource` |
| Provider layers | Effect layers  | Expose HTTP, scheduler, and Telegram provider instances     | `Http`, `Scheduler`, `TelegramBot`     |

## 8. Detailed Design

### Composition graph

The container merges concrete integration clients with the database, task owners, and Bun services. It then provides the transcode queue, background-task owner, transcode scan, and callback runtime in dependency order before exposing provider services. The final application layer provides that graph to the launched program (`src/core/bootstrap.ts:55`).

```text
Clients + Database + task owners + BunServices
  -> TranscodeQueue -> BackgroundTasks -> TranscodeScan -> CallbackRuntime
  -> HTTP + Scheduler + Telegram provider
  -> application program
```

### Startup and finalization

The program retrieves provider and workflow services, installs a finalizer, registers the explicit feature list, starts HTTP, and tracks Telegram polling in a fiber set (`src/core/bootstrap.ts:122`). The finalizer delegates to `shutdownRuntime`; it stops scheduler intake, begins HTTP shutdown, stops Telegram polling, closes producer and queue intake, awaits tracked work, and clears remaining tracked fibers at the deadline (`src/core/bootstrap.ts:100`).

### Database lifetime

`makeDatabaseResource` wraps SQL opening, Drizzle construction, and migration in typed database-initialization errors. Its acquire-release pairing makes SQL closure part of the resource scope rather than a caller responsibility (`src/config/db.ts:31`).

## 9. Open Questions

N/A
