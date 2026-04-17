---
title: HTTP Provider — core runtime
status: condensed
author: Antoine Bouteiller
date: 2026-04-17
related: [docs/specs/architecture.spec.md]
---

## 2. Problem Statement

Autoscan needs a tiny HTTP surface to receive webhooks and trigger feature workflows. The HTTP provider is a **core
runtime provider**: it owns the socket, the route table, body parsing, validation, and the response envelope. It
exposes a small programmatic API so features can attach their own routes at boot. The provider itself knows nothing
about any specific route, path, or domain.

- `[G-1]` Expose a minimal, framework-free HTTP server driven by `node:http`.
- `[G-2]` Offer a route-registration API (`get`, `post`) that integrates Zod validation with handler typing.
- `[G-3]` Provide a uniform response envelope so all consumers return the same shape for success and failure.
- `[G-4]` Provide a test-only `inject()` path so routes can be exercised without binding a socket.
- `[G-5]` Stay feature-agnostic — the provider registers zero application routes of its own.

## 3. Key Design Decisions

| Decision                   | Choice                                                                              | Rationale                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `[KD-1]` Server            | Native `node:http.createServer`                                                     | Zero framework, small bundle (see commit 3fd6395)                                          |
| `[KD-2]` Route store       | `Map<"METHOD:path", RouteHandler>`                                                  | Exact-match only — no params, no wildcards, fast lookup                                    |
| `[KD-3]` Validation        | `post()` wraps registration with `validator.safeParse(body)` before calling handler | Handler's body param is `z.output<TSchema>`, no manual parse in consumers                  |
| `[KD-4]` Response envelope | `{ success, data?, error?, meta: { timestamp } }`                                   | One shape for success and failure; clients parse `success` first                           |
| `[KD-5]` Body parsing      | Read raw, `JSON.parse` for `POST`/`PUT`/`PATCH`; `400 BAD_REQUEST` on parse failure | Avoids a third-party body-parser                                                           |
| `[KD-6]` Authentication    | None at app layer                                                                   | Deploy behind a reverse proxy that does auth — single-user homelab context                 |
| `[KD-7]` `inject()`        | In-memory dispatcher that returns `{ statusCode, json() }`                          | Enables route tests without TCP — avoids race conditions and port conflicts in test runner |
| `[KD-8]` Feature-agnostic  | Provider exposes only the registration API; routes are attached by callers          | Keeps the provider decoupled from any specific feature or domain                           |

## 4. Principles & Intents

- `[PI-1]` **Provider owns transport, not routes.** `HttpProvider` never hard-codes a path. Consumers register routes
  by calling `get()` / `post()`.
- `[PI-2]` **Zod schema is the source of truth** for `post()` — handler body types are inferred via
  `z.output<TSchema>`; no manual parsing inside handlers.
- `[PI-3]` **All responses go through `success()` or `badRequest()`** from `response.ts` — handlers never call
  `reply.send()` with a bare object.
- `[PI-4]` **Handlers return a value only for type convenience** — the reply is sent via side-effect on `reply`;
  returns are ignored by the server.

## 5. Non-Goals

- `[NG-1]` No path params (`/:id`), query strings, wildcards, or middlewares — exact `METHOD:path` match only.
- `[NG-2]` No cookies, sessions, CORS, or auth — out of scope for this service.
- `[NG-3]` No multipart, streaming, or large-body handling — webhook bodies are small JSON documents.
- `[NG-4]` No dynamic route discovery — the provider does not scan the filesystem; routes become active only when a
  caller invokes `get()` / `post()`.
- `[NG-5]` No built-in routes — the provider ships with an empty route table.

## 6. Caveats

- `[C-1]` `HttpProvider.get()` has no validator hook — `GET` is uninstrumented for payloads.
- `[C-2]` The live server's `400 BAD_REQUEST` for JSON-parse failures omits `meta.timestamp`; all other error paths
  include it. See `http.provider.ts`.
- `[C-3]` Handler exceptions are caught and converted to `500 INTERNAL_ERROR`; `res.headersSent` is checked so a
  partially-written response isn't double-written.
- `[C-4]` The route map is global per `HttpProvider` instance — re-registering the same `METHOD:path` silently
  overwrites the previous handler.

## 7. High-Level Components

| Component        | Module type                                   | Responsibility                                                 | Public API surface                                                                                                                                           |
| ---------------- | --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HttpProvider     | Class (`src/providers/http/http.provider.ts`) | Server lifecycle, route registry, body parsing, error envelope | `new HttpProvider({ port, hostname })`, `.get(path, handler)`, `.post(path, validator, handler)`, `.start()`, `.stop()`, `.inject({ method, url, payload })` |
| Response helpers | Module (`src/providers/http/response.ts`)     | Success / failure envelope builders                            | `success(reply, data, status=200)`, `badRequest(reply, message, details?)`                                                                                   |
| Types            | Module (`src/providers/http/types.ts`)        | Request / reply contracts                                      | `AppRequest<TBody>`, `AppReply`, `RouteHandler<TBody>`                                                                                                       |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component        | Module                | Entry point                                                              |
| ---------------- | --------------------- | ------------------------------------------------------------------------ |
| HttpProvider     | `src/providers/http/` | `src/providers/http/http.provider.ts` (`HttpProvider`)                   |
| Response helpers | `src/providers/http/` | `src/providers/http/response.ts` (`success`, `badRequest`)               |
| Types            | `src/providers/http/` | `src/providers/http/types.ts` (`AppRequest`, `AppReply`, `RouteHandler`) |

## 9. Verification Criteria

- `[VC-1]` Registering a `POST` route with a Zod validator forwards parsed `body` (typed as `z.output<TSchema>`) to
  the handler on valid input.
- `[VC-2]` An invalid body returns `400` with `error.code === 'BAD_REQUEST'` and `z.treeifyError` details.
- `[VC-3]` Malformed JSON on `POST`/`PUT`/`PATCH` returns `400` with `error.code === 'BAD_REQUEST'`.
- `[VC-4]` An unknown route returns `404` with `error.code === 'NOT_FOUND'`.
- `[VC-5]` A handler that throws returns `500` with `error.code === 'INTERNAL_ERROR'` and a `meta.timestamp`.
- `[VC-6]` `inject({ method, url, payload })` dispatches the same handler pipeline as the live server and returns
  `{ statusCode, json() }` without opening a socket.
- `[VC-7]` `start()` binds to the configured `hostname:port`; `stop()` closes the server cleanly.
- `[VC-8]` `src/providers/http/**` contains no hard-coded application paths — routes only appear when callers invoke
  `get()` / `post()`.

## 10. Open Questions

N/A
