---
title: Feature Registration
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [architecture, features, registration]
---

# Introduction

Features are declarative bundles of routes, jobs, Telegram commands, and conversations. At startup `registerFeatures`
walks an explicit list and wires each declaration into the matching provider. There is no decorator scan, no glob
import, and no runtime discovery.

## 1. Purpose & Scope

Specify the contract every feature must satisfy and the single registration path used by the runtime. In scope:
the `Feature` shape, the `defineFeature` / `postRoute` helpers, the `registerFeatures` entry point, and the steps
required to add a new feature. Out of scope: the internals of HTTP, scheduler, and Telegram providers (covered by
their own specs).

## 2. Definitions

- **Feature** — Declarative record describing what a slice of the app contributes to the runtime.
- **FeatureRoute** — `(http: HttpProvider) => void`. Registers one HTTP endpoint when invoked.
- **FeatureJob** — `{ name, pattern, handler }`. A scheduled task driven by a cron expression.
- **CommandHandler** — Telegram bot handler keyed by command (`/foo`).
- **Conversation** — Multi-step Telegram flow keyed by its entry command.
- **defineFeature** — Identity function typed as `(feature: Feature) => Feature`. Exists purely for type inference.
- **registerFeatures** — Iterates a `readonly Feature[]` and registers each route, job, command, and conversation
  against the resolved providers.
- **postRoute** — Helper that builds a `FeatureRoute` from `(path, zodValidator, handler)` and calls `http.post`.

## 3. Requirements, Constraints & Guidelines

- **REQ-001** — Every feature lives in `src/features/<feature>/feature.ts` and exports a `Feature` returned by
  `defineFeature(...)`.
- **REQ-002** — `src/features/index.ts` exports a `features` array containing every feature. This array is the
  only registration list consumed by the bootstrap.
- **REQ-003** — `bootstrap.ts` must register every provider and integration client in the container before calling
  `registerFeatures`. Resolution failures inside features always trace back to a missing prior `container.register`.
- **CON-001** — No dynamic discovery. Features are not auto-imported from the filesystem; adding one requires editing
  `src/features/index.ts`.
- **CON-002** — `feature.ts` must be a pure declaration. No network calls, timers, or container resolutions at module
  import time. All I/O happens inside route, job, command, or conversation handlers.
- **CON-003** — Feature order in the array does not affect runtime behavior. Routes, jobs, commands, and conversations
  are registered independently and must not assume sibling features are already wired.
- **GUD-001** — Use `postRoute(path, validator, handler)` instead of writing `(http) => http.post(...)` by hand.
- **GUD-002** — Keep the `Feature` object literal flat and declarative. Move logic into `commands/`, `jobs/`,
  `webhooks/`, or `conversations/` subfolders alongside `feature.ts`.
- **PAT-001** — `FeatureJob.pattern` is a 6-field cron expression `s m h dom mon dow` matching the scheduler provider's
  parser (see `scheduler.spec.md`).

## 4. Interfaces & Data Contracts

```ts
type FeatureRoute = (http: HttpProvider) => void

interface FeatureJob {
  readonly handler: () => Promise<void> | void
  readonly name: string
  readonly pattern: string
}

interface Feature {
  readonly commands?: Readonly<Record<string, CommandHandler>>
  readonly conversations?: Readonly<Record<string, Conversation>>
  readonly jobs?: readonly FeatureJob[]
  readonly name: string
  readonly routes?: readonly FeatureRoute[]
}

declare const defineFeature: (feature: Feature) => Feature

declare const postRoute: <TSchema extends z.ZodType>(path: string, validator: TSchema, handler: RouteHandler<z.output<TSchema>>) => FeatureRoute

declare const registerFeatures: (features: readonly Feature[]) => void
```

`registerFeatures` resolves `HTTP_PROVIDER`, `SCHEDULER_PROVIDER`, and `TELEGRAM_PROVIDER`, then for each feature
calls every `route(http)`, `scheduler.register(job)`, `telegram.registerCommand(name, handler)`, and
`telegram.registerConversation(name, conversation)`.

## 5. Acceptance Criteria

- **AC-001** — Given a new feature `fooFeature` exported from `src/features/foo/feature.ts`, When it is appended to the
  `features` array in `src/features/index.ts`, Then on next startup all of its routes, jobs, commands, and
  conversations are wired without further changes.
- **AC-002** — Given a feature that omits `routes`, `jobs`, `commands`, or `conversations`, When `registerFeatures` runs,
  Then it skips the missing categories without error.
- **AC-003** — Given `bootstrap.ts` calls `registerFeatures` before registering a required client token, When a feature
  handler resolves that token, Then the runtime throws with a clear unregistered-token error.

## 6. Test Automation Strategy

- **Unit** — Import a feature module and assert on the declarative shape: `name`, route count, job names and patterns,
  command keys, conversation keys. No provider needed.
- **Integration** — Build a test container, register stub providers, call `registerFeatures([feature])`, then assert
  the stubs received the expected `post`, `register`, `registerCommand`, and `registerConversation` calls.
- **End-to-end** — Run `bootstrap.ts` against a sandbox, hit registered routes, and trigger a job manually through
  the scheduler provider's test API.

## 7. Rationale & Context

Declarative wiring keeps each feature self-describing and trivially testable: the file is data, not a startup script.
A central `registerFeatures` step is the only place that knows the order of provider resolution, which keeps feature
authors out of container-lifecycle concerns. Explicit listing in `src/features/index.ts` makes the active feature set
greppable and reviewable in PRs — a regression that filesystem-glob discovery would silently allow.

## 8. Dependencies & External Integrations

- `HTTP_PROVIDER` — consumes `FeatureRoute` callbacks via `http.post`.
- `SCHEDULER_PROVIDER` — consumes `FeatureJob` records via `scheduler.register`.
- `TELEGRAM_PROVIDER` — consumes commands and conversations via `registerCommand` and `registerConversation`.
- All three tokens MUST be registered in the container before `registerFeatures` runs (see `bootstrap.ts`).
- Feature handlers may resolve any other registered client (Radarr, Sonarr, Plex, TMDB, Trakt, Cloudflare, Ffmpeg,
  Telegram). Those clients must be registered earlier in `bootstrap.ts` as well.

## 9. Examples & Edge Cases

Routes-only feature:

```ts
export const sendMessageFeature = defineFeature({
  name: 'send_message',
  routes: [postRoute('/send_message', sendMessageValidator, sendMessageWebhook)],
})
```

Jobs + conversations, no routes or commands:

```ts
export const languageSyncFeature = defineFeature({
  conversations: { '/setlanguage': setLanguageConversation },
  jobs: [{ handler: updatePlexSelectedLanguages, name: 'Language Sync', pattern: '0 0 */12 * * *' }],
  name: 'language_sync',
})
```

Full surface (routes, jobs, commands):

```ts
export const transcodingFeature = defineFeature({
  commands: { '/subtitlescan': subtitleScanCommand, '/transcode': transcodeCommand },
  jobs: [{ handler: runTranscodeProcess, name: 'Transcode', pattern: '0 0 */12 * * *' }],
  name: 'transcoding',
  routes: [postRoute('/radarr', radarrValidator, radarrWebhook), postRoute('/sonarr', sonarrValidator, sonarrWebhook)],
})
```

Edge cases: a feature MAY register zero of any category; duplicate route paths, command names, or job names across
features fall through to the underlying provider's collision rules and MUST be avoided by convention.

## 10. Validation Criteria

- `bun run check` passes — `defineFeature` enforces the `Feature` shape at compile time.
- `bun run test` covers each feature's declarative shape and the `registerFeatures` dispatch.
- `src/features/index.ts` exports every `feature.ts` in `src/features/*/`.
- No feature module triggers I/O or container resolution at import time (verifiable by importing in a unit test
  without registering any provider).

## 11. Related Specifications / Further Reading

- `docs/architecture/container.spec.md` — token lifecycle and resolution.
- `docs/project_structure.spec.md` — folder layout for features.
- `src/providers/http/http.spec.md` — `http.post` contract used by `postRoute`.
- `src/providers/scheduler/scheduler.spec.md` — cron pattern grammar for `FeatureJob.pattern`.
- `src/providers/telegram/telegram.spec.md` — command and conversation registration semantics.
