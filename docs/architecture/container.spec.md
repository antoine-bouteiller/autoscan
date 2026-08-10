---
title: Effect Service Composition
version: 2.0
date_created: 2026-05-08
last_updated: 2026-08-05
tags: [architecture, di, effect]
---

# Introduction

Autoscan composes dependencies with Effect v4 `Context.Service` keys and `Layer` values. There is no mutable service locator or process-global registration API.

## Requirements

- Stable interfaces for the database, integrations, providers, callback runtime, and workflow owners are declared in `src/core/runtime.service.ts`.
- Stateless integration clients use `Layer.succeed`; resources and supervised fibers use `Layer.effect` with scope requirements.
- `src/core/bootstrap.ts` is the only production composition root. It builds one layer graph and provides it to one Bun runtime program.
- Database acquisition registers SQL closure before migrations run, so migration failure still closes the client.
- Scheduler callbacks receive the scoped `CallbackRuntime` runner. HTTP routes execute directly in the request Effect; providers do not create runtimes.
- Tests provide local layers through `tests/effect.ts`; `tests/setup.ts` only restores mocks.

## Lifecycle

Layer scopes release in reverse dependency order. HTTP and scheduler intake stop before tracked callbacks and transcode work are drained. The callback runtime is acquired before callback providers and released after them. Database closure occurs after provider and workflow finalization.

## Validation

- Non-mutating format/lint/type checks, `bun run test`, and `bun run knip` pass.
- Searches for the removed custom service-locator API have no matches in production or tests.
- No production module owns a second root runtime.

## Related specifications

- `effect_runtime.spec.md`
- `feature_registration.spec.md`
- `../project_structure.spec.md`
