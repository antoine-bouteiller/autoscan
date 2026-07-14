---
title: HTTP Provider
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [provider, http, runtime]
---

# Introduction

The HTTP provider is the runtime host for incoming HTTP requests (webhooks, manual triggers).
It wraps Bun's built-in `Bun.serve` server with route registration, Zod validation, and a
framework-neutral request/reply abstraction.

## 1. Purpose & Scope

In scope: lifecycle, route registration, body parsing, validation, response shaping, error mapping.
Out of scope: authentication, rate limiting, TLS termination (handled upstream by Cloudflare).

## 2. Definitions

- **Provider**: long-lived singleton resolved from the DI container at `TOKENS.HTTP_PROVIDER`.
- **Route**: a `METHOD:path` key mapping to a single `RouteHandler`.
- **Handler**: an async function `(request, reply) => void` running per request.
- **Validator**: a `z.ZodType` schema parsed against `request.body` before the handler runs.

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Lifecycle: `start()` binds to host:port, `stop()` closes the server gracefully.
- **REQ-002** Routes are registered before `start()`; the route map is immutable at runtime in practice.
- **REQ-003** `post()` requires a Zod validator; `get()` does not validate.
- **REQ-004** Port and hostname come from the constructor; bootstrap passes `{ port: 3030 }` and defaults `hostname` to `0.0.0.0`.
- **REQ-005** Bodies are accepted only for `POST`, `PUT`, `PATCH`; parsed as JSON.
- **CON-001** Single route per `METHOD:path` key; later registrations overwrite earlier ones silently.
- **CON-002** No path parameters or query string parsing; routes match on exact `req.url`.
- **CON-003** No middleware chain; handlers run directly.
- **GUD-001** Use `postRoute()` from `@/core/feature` to declare routes; do not call `http.post()` directly outside a feature.
- **GUD-002** Use `success()` / `badRequest()` from `response.ts` to shape replies; do not write `reply.send` ad hoc.
- **PAT-001** Thin wrapper over `Bun.serve` keeps the dependency surface minimal and the contract stable across framework swaps.

## 4. Interfaces & Data Contracts

```ts
class HttpProvider {
  constructor(options: { hostname?: string; port?: number })
  get(path: string, handler: RouteHandler): void
  post<TSchema extends z.ZodType>(path: string, validator: TSchema, handler: RouteHandler<z.output<TSchema>>): void
  inject(options: { method: string; payload?: unknown; url: string }): Promise<InjectResponse>
  start(): Promise<void>
  stop(): Promise<void>
}

type RouteHandler<TBody = unknown> = (
  request: { body: TBody },
  reply: { status(code: number): AppReply; send(data: unknown): void }
) => Promise<void> | void
```

Response envelope (from `response.ts`):

```json
{ "data": ..., "error": { "code", "message", "details" }, "meta": { "timestamp" }, "success": true }
```

| Condition                   | Status | `error.code`     | Source                           |
| --------------------------- | ------ | ---------------- | -------------------------------- |
| Unknown route               | 404    | `NOT_FOUND`      | `start()` dispatcher             |
| Malformed JSON body         | 400    | `BAD_REQUEST`    | `start()` body parser            |
| Zod validation failure      | 400    | `BAD_REQUEST`    | `post()` wrapper, `badRequest()` |
| Unhandled handler exception | 500    | `INTERNAL_ERROR` | `start()` catch block            |
| Handler success             | 200    | n/a              | `success()` helper               |

`HttpError` and `ValidationError` (from `@/shared/errors/`) are tagged errors thrown by integrations
or feature code; the provider does not inspect their tags — it logs via `logError` and returns 500.
Map specific errors to 4xx by catching them inside the handler and calling `badRequest(reply, ...)`.

## 5. Acceptance Criteria

- **AC-001** Given a route registered via `post(path, schema, handler)`, when a valid POST arrives, then the handler runs with `request.body` typed as `z.output<TSchema>`.
- **AC-002** Given an invalid body, when POST arrives, then the response is 400 with `error.code = BAD_REQUEST` and `error.details` containing the Zod tree.
- **AC-003** Given `stop()` is called, then the listening socket closes and pending connections drain before the promise resolves.
- **AC-004** Given a request to an unregistered path, then 404 is returned without invoking any handler.
- **AC-005** Given `inject({ method, url, payload })`, then the response mirrors a real HTTP call without binding a socket.

## 6. Test Automation Strategy

- Unit-test `post()` validation by calling `inject()` with valid and invalid payloads; assert `statusCode` and `json()`.
- Unit-test `response.ts` helpers in isolation against a fake `AppReply`.
- Integration-test `start()`/`stop()` by binding to an ephemeral port (`{ port: 0 }`) and issuing real `fetch` calls.

## 7. Rationale & Context

A thin wrapper over `Bun.serve` (no Hono, no Express) keeps the dependency surface minimal and lets
features depend on the `RouteHandler` / `AppReply` contract instead of a third-party framework. The
provider owns body parsing, validation, and error shaping so feature code stays focused on domain logic.
The framework can be swapped without touching feature code as long as `RouteHandler` and `AppReply` hold.

## 8. Dependencies & External Integrations

### Technology Platform Dependencies

- **PLT-001** Bun (`Bun.serve`, `Server`).
- **PLT-002** No HTTP framework — direct `Bun.serve` server with a manual route map.
- **PLT-003** Zod (`safeParse`, `treeifyError`) for per-route body validation.

## 9. Examples & Edge Cases

Feature-side declaration:

```ts
import { z } from 'zod'
import { defineFeature, postRoute } from '@/core/feature'
import { success } from '@/providers/http/response'

const schema = z.object({ id: z.string() })

export const myFeature = defineFeature({
  name: 'my-feature',
  routes: [
    postRoute('/webhook', schema, async ({ body }, reply) => {
      success(reply, { received: body.id })
    }),
  ],
})
```

Request and response:

```sh
curl -X POST http://localhost:3030/webhook -d '{"id":"abc"}'
# 200 { "data": { "received": "abc" }, "meta": { "timestamp": "..." }, "success": true }

curl -X POST http://localhost:3030/webhook -d '{}'
# 400 { "error": { "code": "BAD_REQUEST", "details": { ... }, "message": "invalid request" }, ... }
```

Edge cases: empty body on POST yields `request.body = undefined` (Zod will reject unless schema allows it);
duplicate `post(path, ...)` registrations silently overwrite; `stop()` before `start()` resolves immediately.

## 10. Validation Criteria

- `bun run check` and `bun run test` pass.
- A booted process responds 404 on unknown routes and 400 on malformed JSON without crashing.
- `SIGINT` triggers `stop()` and the process exits with code 0.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/container.spec.md
- ../../../docs/architecture/feature_registration.spec.md
