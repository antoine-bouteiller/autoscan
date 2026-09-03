---
title: Feature Registration
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
parent-spec: docs/architecture/architecture.spec.md
related: [docs/project_structure.spec.md]
---

## 2. Problem Statement

N/A — goals are owned by `docs/architecture/architecture.spec.md`.

## 3. Key Design Decisions

| Decision                     | Choice                                                                                          | Rationale                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Feature declaration | A feature is a declarative object with optional routes, jobs, commands, and conversations.      | Imports remain free of registration I/O and each capability is visible in one declaration (`src/core/feature.ts:18`).       |
| `[KD-2]` Explicit registry   | `src/features/index.ts` imports and orders every active feature in a single `features` array.   | Activation is reviewable and stable rather than dependent on discovery behavior (`src/features/index.ts:1`).                |
| `[KD-3]` Provider injection  | `registerFeatures` receives HTTP, scheduler, and Telegram providers as arguments.               | Registration has no global lookup and delegates category-specific policy to the owning provider (`src/core/feature.ts:43`). |
| `[KD-4]` Handler execution   | Registered handlers retain `Effect` requirements and errors until their provider executes them. | Providers can apply the correct request, callback, and user-facing error behavior at the boundary.                          |

## 4. Principles & Intents

- `[PI-1]` Declarative feature modules — refines umbrella `[PI-1]`: feature declarations describe capabilities without composition or transport startup.

## 5. Non-Goals

- `[NG-1]` Dynamic feature discovery — refines umbrella `[NG-1]`: filesystem scanning, decorators, and side-effect imports do not activate features.

## 6. Caveats

- `[C-1]` A feature name is part of its declaration but registration dispatches categories rather than using the name as a provider key (`src/core/feature.ts:18`).
- `[C-2]` Duplicate scheduler job names are handled by the scheduler provider, which skips the later registration (`src/providers/scheduler/scheduler.provider.ts:25`).

## 7. High-Level Components

| Component               | Module type        | Responsibility                                            | Public API surface         |
| ----------------------- | ------------------ | --------------------------------------------------------- | -------------------------- |
| Feature declaration     | core type/function | Describe a feature's optional capability collections      | `Feature`, `defineFeature` |
| Route helper            | core helper        | Bind a schema-validated POST handler to HTTP registration | `postRoute`                |
| Feature registry        | feature index      | Declare the active ordered feature collection             | `features`                 |
| Registration dispatcher | core function      | Forward each declared category to its provider            | `registerFeatures`         |

## 8. Detailed Design

### Declaration contract

A `Feature` has a required name and optional collections for HTTP route installers, scheduled jobs, Telegram commands, and Telegram conversations. `defineFeature` returns that declaration unchanged, preserving the object as an import-safe description (`src/core/feature.ts:18`). `postRoute` adapts a schema constraint decoder and route handler to the HTTP provider's `post` API (`src/core/feature.ts:34`).

### Registry and dispatch

The registry explicitly imports the language-sync, queue-cleanup, send-message, and transcoding declarations (Trakt-sync is implemented but intentionally not registered) and exposes them in their registration order (`src/features/index.ts:1`). `registerFeatures` iterates that array and forwards each present category to the corresponding provider, skipping absent collections (`src/core/feature.ts:43`).

### Provider-bound behavior

HTTP validates POST payloads before the feature handler and produces a bad-request response for an invalid request body (`src/providers/http/http.provider.ts:55`). Scheduler registration owns cron installation and duplicate-job handling. Telegram registration stores command and conversation handlers for polling dispatch (`src/providers/telegram/telegram.provider.ts:25`). These policies remain provider-owned rather than embedded in feature declarations.

## 9. Open Questions

N/A
