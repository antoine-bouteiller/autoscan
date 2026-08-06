---
title: Feature Registration
version: 2.0
date_created: 2026-05-08
last_updated: 2026-08-05
tags: [architecture, features, effect]
---

# Introduction

Features are declarative bundles of Effect-based routes, jobs, Telegram commands, and conversations. `registerFeatures` walks the explicit `features` list and registers each declaration with providers passed by the composition root.

## Requirements

- Every feature exports a value created by `defineFeature` from `src/features/<feature>/feature.ts`.
- `src/features/index.ts` explicitly lists every active feature; dynamic discovery is forbidden.
- Feature declarations perform no I/O at import time.
- Route, job, command, and conversation handlers return Effects. Their dependencies and recoverable errors remain visible in Effect channels until a provider boundary.
- `registerFeatures(features, { http, scheduler, telegram })` receives providers explicitly and performs no global lookup.
- Native providers run callbacks through the single scoped callback bridge. HTTP maps unhandled failures to the existing 500 response; Telegram resets conversation state, sends the fixed unexpected-error message, and continues polling.

## Contracts

```ts
type FeatureRoute = (http: HttpProvider) => void

interface FeatureJob {
  readonly handler: Effect.Effect<void, unknown, AppRequirements>
  readonly name: string
  readonly pattern: string
}

interface FeatureProviders {
  readonly http: HttpProvider
  readonly scheduler: SchedulerProvider
  readonly telegram: TelegramProvider
}
```

Feature order is explicit and stable. Missing categories are skipped. Provider collision policies remain authoritative for duplicate routes, jobs, or command names.

## Validation

- `bun run check` verifies handler requirements and errors.
- `bun run test` covers HTTP injection, scheduler execution, and Telegram command/conversation behavior.
- Importing a feature module starts no network listener, timer, database connection, or fiber.

## Related specifications

- `container.spec.md`
- `effect_runtime.spec.md`
- `../project_structure.spec.md`
