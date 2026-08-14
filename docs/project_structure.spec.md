---
title: Project Structure
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related: [docs/architecture/architecture.spec.md]
---

## 2. Problem Statement

Autoscan contains business features, cross-feature domains, vendor integrations, runtime providers, and application composition in one TypeScript package. Contributors need a predictable layout and import boundary so a capability's ownership, dependencies, tests, and documentation remain discoverable as the service grows.

- `[G-1]` Make the ownership and role of every source module clear from its location and name.
- `[G-2]` Keep feature capabilities isolated while providing deliberate locations for shared business logic, integrations, and runtime hosts.
- `[G-3]` Preserve a single-package TypeScript and Bun development surface with mirrored test paths.

## 3. Key Design Decisions

| Decision                     | Choice                                                                                                                     | Rationale                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Source partitioning | `src/` is partitioned into `config`, `core`, `database`, `domains`, `features`, `integrations`, `providers`, and `shared`. | Directory ownership distinguishes composition, business capability, vendor boundary, and reusable code.                                  |
| `[KD-2]` Feature boundary    | Each feature owns its declaration and local handlers; feature-to-feature imports are excluded.                             | Local ownership prevents implicit coupling and gives shared logic a deliberate promotion path.                                           |
| `[KD-3]` Import boundary     | Internal imports use the `@/*` alias rooted at `src`, with an analogous `@tests/*` alias for test support.                 | Rooted imports make cross-module dependencies legible and avoid relative traversal across architectural boundaries (`tsconfig.json:12`). |
| `[KD-4]` Explicit activation | Features are imported and listed explicitly in `src/features/index.ts`.                                                    | The active application surface is statically reviewable and independent of filesystem discovery (`src/features/index.ts:1`).             |
| `[KD-5]` Test layout         | Tests mirror source paths under `tests/` and use Bun's test command.                                                       | The test location follows the module it verifies while retaining shared test infrastructure at the test root (`package.json:13`).        |

## 4. Principles & Intents

- `[PI-1]` One owner per module — a module belongs to the narrowest feature, domain, integration, provider, or shared boundary that owns its responsibility.
- `[PI-2]` Deliberate reuse — business logic becomes a domain or shared utility only when its consumers justify cross-feature ownership.
- `[PI-3]` Thin vendor boundaries — integrations contain typed external-client and validation concerns; workflow orchestration belongs to features or domains.
- `[PI-4]` Readable imports — aliases express architectural direction and `.js` extensions preserve ESM import compatibility.

## 5. Non-Goals

- `[NG-1]` A monorepo or multiple application packages.
- `[NG-2]` Feature barrel exports or sibling-feature dependencies.
- `[NG-3]` Dynamic feature discovery and side-effect activation.
- `[NG-4]` Deep nesting that obscures the kind and owner of a feature-local module.

## 6. Caveats

- `[C-1]` TypeScript uses strict compiler options and bundler module resolution, so path aliases are a compiler contract as well as a source convention (`tsconfig.json:7`).
- `[C-2]` Runtime configuration is decoded from the environment at startup and belongs under `src/config` rather than a feature (`src/config/env.ts:46`).
- `[C-3]` The package is private and declares Bun as its package manager (`package.json:2`).

## 7. High-Level Components

```text
src/
├── config/        startup configuration, logging, database setup
├── core/          composition and feature-registration contracts
├── database/      database schema
├── domains/       cross-feature business modules
├── features/      self-contained business capabilities
├── integrations/  vendor adapters and validators
├── providers/     HTTP, scheduler, and Telegram runtime hosts
└── shared/        reusable utilities, error types, and shared types
```

| Component                   | Module type                 | Responsibility                                                                        | Public API surface                     |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- |
| Source partitions           | directories                 | Separate configuration, composition, business, vendor, provider, and shared ownership | module-specific exports                |
| Feature module              | feature directory           | Own a business capability and expose its declaration                                  | `<name>/feature.ts`                    |
| Domain and shared modules   | reusable modules            | Hold deliberately reusable business logic, utilities, types, and errors               | focused module exports                 |
| Integration module          | vendor adapter              | Encapsulate a vendor client and boundary validation                                   | client interface and validator exports |
| Provider module             | runtime host                | Own HTTP, scheduler, or Telegram transport lifecycle                                  | provider class methods                 |
| Import and test conventions | compiler/test configuration | Define aliases, ESM imports, and source-to-test mapping                               | `@/*`, `@tests/*`, Bun test scripts    |

## 8. Detailed Design

### Source partitions

`src/config` owns environment loading, logging, and database setup; `src/core` owns bootstrap, service contracts, and feature registration. `src/database` owns the Drizzle schema; `src/domains` owns cross-feature business modules; `src/features` owns business capabilities; `src/integrations` owns vendor adapters; `src/providers` owns runtime hosts; and `src/shared` owns reusable utilities, errors, and types. These are the top-level source directories.

### Feature modules

A feature directory contains its `feature.ts` declaration and capability-specific files such as services, commands, jobs, webhooks, validators, repositories, types, and errors. Feature declarations are explicitly collected by `src/features/index.ts`; their routes, jobs, commands, and conversations are registered through the core feature contract (`src/core/feature.ts:18`). A feature does not import a sibling feature. Logic reused across enough consumers belongs in a domain, shared module, integration, or provider according to its responsibility.

### Domains, integrations, and providers

Domains hold cross-feature business services and repositories. Integrations provide thin vendor clients and schemas, while providers own long-lived HTTP, scheduler, and Telegram transport behavior. The composition boundary supplies those providers to feature registration (`src/core/bootstrap.ts:145`), preserving the separation between capability declarations and runtime lifecycle.

### Naming, imports, and tests

Files and folders use snake_case. Role-specific files use descriptive kind suffixes such as `.service.ts`, `.command.ts`, `.job.ts`, `.webhook.ts`, `.validator.ts`, `.repository.ts`, `.provider.ts`, and `.errors.ts`; feature-local files of a kind reside in the matching kind directory where that improves discoverability. Internal source imports use `@/` and ESM `.js` specifiers, as illustrated by the explicit feature registry (`src/features/index.ts:1`). Tests mirror source paths under `tests/`, while root-level test helpers and fixtures remain shared through `@tests/*` (`tsconfig.json:12`).

## 9. Open Questions

N/A
