---
title: Application Architecture
kind: umbrella
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related: [docs/project_structure.spec.md]
---

## 2. Problem Statement

Autoscan combines external-service clients, long-lived providers, and feature workflows in one Bun process. The application needs explicit composition and lifecycle boundaries so features remain independently understandable while HTTP, cron, and Telegram work share one managed runtime.

- `[G-1]` Provide one explicit, typed application composition boundary for providers, integrations, database access, and workflows.
- `[G-2]` Keep feature declarations declarative and make their registration order and provider interactions predictable.
- `[G-3]` Ensure application shutdown stops intake and drains or interrupts managed work safely.

## 3. Key Design Decisions

| Decision                        | Choice                                                                                           | Rationale                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Dependency composition | Effect `Context.Service` keys and `Layer` graphs define application dependencies.                | Typed requirements make dependencies visible to callers and permit production and test compositions without global lookup. |
| `[KD-2]` Composition root       | The bootstrap program owns production layer assembly and provider startup.                       | A single owner makes resource lifetime and startup order inspectable.                                                      |
| `[KD-3]` Feature activation     | The feature registry is an explicit ordered array.                                               | Explicit imports and ordering avoid hidden I/O or filesystem-dependent activation.                                         |
| `[KD-4]` Shutdown               | Intake stops before tracked work is awaited; a 30-second deadline clears remaining tracked work. | The service accepts no further work while allowing bounded graceful completion.                                            |

## 4. Principles & Intents

- `[PI-1]` Explicit dependencies — services enter effects through typed requirements and composition boundaries rather than process-global state.
- `[PI-2]` Provider-owned boundaries — providers own transport-specific registration and user-facing failure contracts.
- `[PI-3]` Scoped work — asynchronous work is tracked by a scope-owning runtime or workflow owner so shutdown can account for it.

## 5. Non-Goals

- `[NG-1]` A plugin-discovery system or implicit feature activation.
- `[NG-2]` A second process-global runtime or service locator.
- `[NG-3]` Cross-feature business orchestration in the architecture layer.

## 6. Caveats

- `[C-1]` The application runs on Bun and relies on Bun-provided HTTP, cron, SQL, and process facilities; package versions are declared in `package.json:19`.
- `[C-2]` Environment values are loaded and schema-decoded during module initialization, so configuration is a startup trust boundary (`src/config/env.ts:23`).

## 7. High-Level Components

| Component            | Module type      | Responsibility                                                      | Public API surface                               |
| -------------------- | ---------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| Container            | core composition | Assemble service layers, providers, and shutdown ownership          | `program`, `shutdownRuntime`                     |
| Effect runtime       | runtime contract | Define services, scopes, callback execution, and shutdown semantics | service keys, `AppRequirements`                  |
| Feature registration | core registry    | Describe and register routes, jobs, commands, and conversations     | `defineFeature`, `postRoute`, `registerFeatures` |

| Leaf                           | Depends on                                  | Rationale                                                                           |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `container.spec.md`            | Effect runtime `[KD-1]`                     | The container supplies concrete layers for the runtime service keys.                |
| `effect_runtime.spec.md`       | Container `[KD-2]`                          | Runtime lifetime is established by the composition root.                            |
| `feature_registration.spec.md` | Container `[KD-2]`, Effect runtime `[KD-1]` | Registration receives constructed providers and handlers retain typed requirements. |

## 8. Detailed Design

| Leaf                                             | Detailed design                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `docs/architecture/container.spec.md`            | Production layer graph, provider construction, startup, and finalization.     |
| `docs/architecture/effect_runtime.spec.md`       | Service contracts, callback bridge, workflow ownership, errors, and shutdown. |
| `docs/architecture/feature_registration.spec.md` | Feature declaration contract and provider registration flow.                  |

## 9. Open Questions

N/A
