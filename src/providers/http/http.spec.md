---
title: HTTP Provider
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related: [docs/project_structure.spec.md, docs/architecture/architecture.spec.md, src/features/transcoding/transcoding.spec.md]
---

## 2. Problem Statement

Autoscan needs one lifecycle-managed HTTP boundary through which features accept webhooks without owning a listener or duplicating request/error handling. Feature handlers need typed request bodies and the application Effect context, while callers need stable JSON responses and cancellation to reach in-flight work.

- `[G-1]` Provide declarative GET and validated POST route registration for feature-owned handlers.
- `[G-2]` Serve a consistent JSON API contract for successful, invalid, missing, and failed requests.
- `[G-3]` Keep listener lifecycle and in-process request execution explicit and scope-safe.

## 3. Key Design Decisions

| Decision                    | Choice                                                                                              | Rationale                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Routing            | Accumulate routes in `HttpProvider` and construct an Effect `HttpRouter` when serving or injecting. | A shared router lets TCP traffic and tests exercise identical matching and handler behavior without binding a port for tests.     |
| `[KD-2]` Request validation | Decode POST JSON first, then decode the registered Effect Schema with all issues.                   | Separating syntax and shape failures gives webhook producers actionable 400 responses without exposing handler internals.         |
| `[KD-3]` Failure boundary   | Convert non-interruption handler causes to a logged 500 response; propagate interruption.           | Callers receive a stable failure contract while cancellation remains cooperative rather than being misreported as a server error. |
| `[KD-4]` Server ownership   | Hold the server acquisition in one closeable scope and close that scope through `stop`.             | A single owner makes start/stop idempotent and releases partially acquired resources through Effect finalization.                 |

## 4. Principles & Intents

- `[PI-1]` Boundary normalization — translate HTTP concerns at the provider edge; handlers receive `AppRequest`, `AppReply`, and application requirements.
- `[PI-2]` Exact routing — treat path case and trailing slashes as meaningful so webhook endpoints remain unambiguous.
- `[PI-3]` Cooperative cancellation — preserve interruption all the way from the request signal to the handler Effect.

## 5. Non-Goals

- `[NG-1]` The provider does not define feature routes, request schemas, or business responses.
- `[NG-2]` The provider does not add authentication, authorization, rate limiting, or request middleware.
- `[NG-3]` The provider does not support HTTP methods other than its GET and POST registration API.

## 6. Caveats

- `[C-1]` The listener defaults to `0.0.0.0:3030`; composition supplies alternate host, port, or server acquisition when required (`src/providers/http/http.provider.ts:55`).
- `[C-2]` The fallback 404 response lacks the timestamp metadata added by reply helpers (`src/providers/http/http.provider.ts:44`).
- `[C-3]` `inject` validates that a response conforms to the API envelope and fails its Effect if a handler sends arbitrary JSON (`src/providers/http/http.provider.ts:97`).
- `[C-4]` The fallback route and execution boundary construct JSON responses directly, while feature reply helpers add timestamp metadata (`src/providers/http/http.provider.ts:41-45`, `src/providers/http/response.ts:12-16`).
- `[C-5]` JSON parsing applies to PUT and PATCH traffic at execution time even though the registration surface exposes GET and POST (`src/providers/http/http.provider.ts:60-77`, `src/providers/http/http.provider.ts:120-129`).
- `[C-6]` A handler that does not send a payload is serialized with the selected status and an undefined payload (`src/providers/http/http.provider.ts:131-144`).
- `[C-7]` Error responses from the execution boundary use their own timestamp source rather than the reply helper (`src/providers/http/http.provider.ts:149-160`).

## 7. High-Level Components

| Component        | Module type           | Responsibility                                         | Public API surface                                       |
| ---------------- | --------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| HTTP provider    | Effect runtime host   | Register, route, serve, inject, and stop HTTP work     | `HttpProvider`, `get`, `post`, `inject`, `start`, `stop` |
| Response helpers | HTTP response adapter | Build timestamped success and bad-request envelopes    | `success`, `badRequest`                                  |
| Route contracts  | TypeScript contracts  | Define handler request, reply, and Effect requirements | `AppRequest`, `AppReply`, `RouteHandler`                 |

## 8. Detailed Design

### HTTP provider

`HttpProvider` stores registered routes and adds a wildcard 404 route to an exact, case-sensitive router (`src/providers/http/http.provider.ts:44-45`, `src/providers/http/http.provider.ts:107-113`). `get` registers a handler directly. `post` decodes its validator with all schema issues; a validation failure logs formatted issues and sends `BAD_REQUEST` with message `invalid request` (`src/providers/http/http.provider.ts:64-76`).

For POST, PUT, and PATCH requests, execution decodes JSON into an unknown body. Malformed JSON returns `{ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }` with status 400 (`src/providers/http/http.provider.ts:120-129`). The provider creates a mutable reply adapter with default 200 status, then serializes the handler-selected payload and status (`src/providers/http/http.provider.ts:131-144`). Non-interruption causes log once and produce `INTERNAL_ERROR`, a timestamp, and status 500; interruption is re-failed unchanged (`src/providers/http/http.provider.ts:145-162`).

`inject` forms a Web `Request`, uses the supplied application context, binds the active abort signal, and disposes the web handler on completion (`src/providers/http/http.provider.ts:79-104`). `start` acquires Bun's server with a 30-second graceful shutdown timeout, installs the router, and remembers its scope. `stop` clears that reference and closes the scope, so repeated stops are harmless (`src/providers/http/http.provider.ts:167-199`).

The provider accepts a scoped server acquisition override, allowing composition to provide a server implementation while retaining the same scope ownership model (`src/providers/http/http.provider.ts:10-14`, `src/providers/http/http.provider.ts:173-184`). The listener logs its formatted address when serving and logs a distinct stopped event when its scope closes (`src/providers/http/http.provider.ts:185-199`).

### Response helpers

`success` and `badRequest` send `{ success, data|error, meta.timestamp }` through `AppReply`; `badRequest` always selects status 400 and may include schema details (`src/providers/http/response.ts:12-28`). Feature handlers use these helpers to maintain the envelope that `inject` decodes.

### Route contracts

`AppRequest` exposes a generic `body`; `AppReply` supports fluent status selection and payload delivery. A `RouteHandler` returns an Effect requiring `AppRequirements`, which permits runtime dependencies to remain supplied at request execution (`src/providers/http/types.ts:5-14`).

## 9. Open Questions

N/A
